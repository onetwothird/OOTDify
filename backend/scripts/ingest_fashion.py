"""Ingest a public fashion dataset into the shared catalog (`public.clothing`).

Pulls the *Fashion Product Images* dataset (44k real product photos with
category / colour / usage metadata) from the Hugging Face datasets server over
plain HTTPS — no Kaggle account or token required. Rows are normalized with
`services/fashion_taxonomy`, images are uploaded to the public `clothing`
storage bucket, and a `clothing` row is inserted per item.

How the fetch works: the `datasets-server` API supports SQL-like filters, so we
query a curated list of article types (Tshirts, Shorts, Jeans, Sneakers, …)
category by category. That guarantees the picker always sees real tops, bottoms,
shoes, layers, dresses and accessories — even though the raw dataset is heavily
skewed toward Topwear.

Usage (from the backend/ folder, with the venv active):

    python scripts/ingest_fashion.py --limit 1200
    python scripts/ingest_fashion.py --dry-run --limit 50
    python scripts/ingest_fashion.py --reset          # drop previously ingested rows

The run is idempotent: rows already ingested (matched by
`metadata.external_id`) are skipped, and images are upserted. Safe to re-run.

Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in backend/.env (the same
service-role credentials the API uses).
"""
from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Sequence, Set, Tuple
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import Config  # noqa: E402
from services.fashion_taxonomy import CATEGORIES, normalize_row  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("ingest_fashion")


DATASET = "ashraq/fashion-product-images-small"
SOURCE = "kaggle:fashion-product-images-small"
ROWS_URL = "https://datasets-server.huggingface.co/filter"

BUCKET = "clothing"
IMAGE_PREFIX = "fashion"
INSERT_BATCH = 100
ROWS_PER_PAGE = 100
REQUEST_TIMEOUT = 60
MAX_FETCH_ATTEMPTS = 4
FETCH_BACKOFF_MAX = 20


ARTICLE_TARGETS: Sequence[Tuple[str, str]] = (
    ("Topwear", "Tshirts"),
    ("Topwear", "Shirts"),
    ("Topwear", "Tops"),
    ("Topwear", "Sweatshirts"),
    ("Topwear", "Sweaters"),
    ("Bottomwear", "Jeans"),
    ("Bottomwear", "Trousers"),
    ("Bottomwear", "Shorts"),
    ("Bottomwear", "Track Pants"),
    ("Bottomwear", "Skirts"),
    ("Dress", "Dresses"),
    ("Outerwear", "Jackets"),
    ("Outerwear", "Coats"),
    ("Outerwear", "Blazers"),
    ("Footwear", "Sports Shoes"),
    ("Footwear", "Casual Shoes"),
    ("Footwear", "Formal Shoes"),
    ("Footwear", "Sneakers"),
    ("Footwear", "Sandals"),
    ("Footwear", "Flats"),
    ("Footwear", "Heels"),
    ("Footwear", "Flip Flops"),
    ("Bags", "Handbags"),
    ("Bags", "Backpacks"),
    ("Bags", "Wallets"),
    ("Accessories", "Watches"),
    ("Accessories", "Sunglasses"),
    ("Accessories", "Caps"),
)



def _where_clause(article_type: str) -> str:
    return f'"articleType"=\'{article_type}\''


def fetch_rows(article_type: str, offset: int, length: int = ROWS_PER_PAGE) -> Tuple[List[Dict[str, Any]], int]:
    """Return (rows, total_rows_for_this_article_type) for a /filter page.

    Transient failures (429 / 5xx / timeouts) are retried with exponential
    backoff so a flaky datasets-server does not abort the whole ingestion.
    """
    import requests

    where = quote(_where_clause(article_type), safe="")
    url = (
        f"{ROWS_URL}?dataset={DATASET}&config=default&split=train"
        f"&where={where}&offset={offset}&length={length}"
    )
    last_exc: Optional[Exception] = None
    for attempt in range(1, MAX_FETCH_ATTEMPTS + 1):
        try:
            resp = requests.get(url, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 429 or resp.status_code >= 500:
                raise requests.HTTPError(f"HTTP {resp.status_code}", response=resp)
            resp.raise_for_status()
            data = resp.json()
            return _unwrap_rows(data.get("rows") or []), int(data.get("num_rows_total") or 0)
        except Exception as exc:
            last_exc = exc
            if attempt >= MAX_FETCH_ATTEMPTS:
                break
            wait = min(2 ** (attempt + 1), FETCH_BACKOFF_MAX)
            logger.warning(
                "  fetch %s offset=%d attempt %d/%d failed (%s) — retrying in %ds",
                article_type,
                offset,
                attempt,
                MAX_FETCH_ATTEMPTS,
                exc,
                wait,
            )
            time.sleep(wait)
    raise last_exc or RuntimeError(f"fetch failed for {article_type}")


def _unwrap_rows(raw_rows: List[Any]) -> List[Dict[str, Any]]:
    """Return the dataset rows from a datasets-server response page.

    The API wraps every row as {row_idx, row: {...}, truncated_cells}; keep a
    flat fallback for tests / mirrors that return rows directly.
    """
    nested = [
        r["row"] for r in raw_rows if isinstance(r, dict) and isinstance(r.get("row"), dict)
    ]
    if nested:
        return nested
    return [r for r in raw_rows if isinstance(r, dict)]


def _image_url(row: Dict[str, Any]) -> Optional[str]:
    image = row.get("image")
    if isinstance(image, dict):
        src = image.get("src")
        return str(src) if src else None
    return None


def download_image(url: str) -> Optional[bytes]:
    """Fetch a product photo. Returns raw bytes or None on failure."""
    import requests

    try:
        resp = requests.get(url, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 200 or not resp.content:
            return None
        return resp.content
    except Exception as exc:
        logger.debug("Image download failed for %s: %s", url[:80], exc)
        return None


def _content_type(data: bytes) -> str:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:2] == b"\xff\xd8":
        return "image/jpeg"
    if data[:4] in (b"RIFF",) and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


def _extension(content_type: str) -> str:
    return {"image/png": "png", "image/webp": "webp"}.get(content_type, "jpg")


class Budget:
    def __init__(self, total: int, per_category: int, per_article: int) -> None:
        self.total = total
        self.per_category = per_category
        self.per_article = per_article
        self.cat_counts: Dict[str, int] = {}
        self.article_counts: Dict[str, int] = {}
        self.accepted = 0

    def full(self) -> bool:
        return self.accepted >= self.total

    def accept(self, category: str, subcategory: Optional[str]) -> bool:
        if self.full():
            return False
        if self.cat_counts.get(category, 0) >= self.per_category:
            return False
        article_key = subcategory or "—"
        if self.article_counts.get(article_key, 0) >= self.per_article:
            return False
        self.cat_counts[category] = self.cat_counts.get(category, 0) + 1
        self.article_counts[article_key] = self.article_counts.get(article_key, 0) + 1
        self.accepted += 1
        return True


def existing_external_ids(sb) -> Set[str]:
    """All `metadata.external_id` values already in the catalog (for idempotency)."""
    found: Set[str] = set()
    start = 0
    page = 1000
    while True:
        resp = sb.table("clothing").select("metadata").range(start, start + page - 1).execute()
        rows = resp.data or []
        for row in rows:
            ext = (row.get("metadata") or {}).get("external_id")
            if ext:
                found.add(str(ext))
        if len(rows) < page:
            break
        start += page
    return found


def reset_source(sb, source: str) -> int:
    """Delete previously ingested rows for this source. Returns rows deleted."""
    resp = (
        sb.table("clothing")
        .select("id", count="exact")
        .eq("metadata->>source", source)
        .execute()
    )
    count = resp.count or 0
    if count:
        sb.table("clothing").delete().eq("metadata->>source", source).execute()
    return count


def upload_image(sb, external_id: str, data: bytes) -> Optional[str]:
    """Upload one image to the public bucket and return its public URL."""
    content_type = _content_type(data)
    path = f"{IMAGE_PREFIX}/{external_id}.{_extension(content_type)}"
    try:
        sb.storage.from_(BUCKET).upload(
            path,
            data,
            {"content-type": content_type, "cache-control": "31536000", "upsert": "true"},
        )
    except Exception as exc:  # upload failures are logged, not fatal
        logger.warning("Image upload failed for %s: %s", external_id, exc)
        return None
    try:
        return sb.storage.from_(BUCKET).get_public_url(path)
    except Exception as exc:
        logger.warning("Public URL failed for %s: %s", external_id, exc)
        return None


def flush(sb, rows: List[Dict[str, Any]]) -> int:
    if not rows:
        return 0
    try:
        sb.table("clothing").insert(rows).execute()
        return len(rows)
    except Exception as exc:
        logger.error("Insert batch failed (%d rows): %s", len(rows), exc)
        return 0

def run(args: argparse.Namespace) -> int:
    from services.supabase_client import is_configured, get_supabase

    if not args.dry_run and not is_configured():
        logger.error(
            "Supabase is not configured. Set SUPABASE_URL and "
            "SUPABASE_SERVICE_ROLE_KEY in backend/.env."
        )
        return 2

    sb = None if args.dry_run else get_supabase()

    skip_ids: Set[str] = set()
    if sb is not None:
        if args.reset:
            removed = reset_source(sb, SOURCE)
            logger.info("Reset: removed %d previously ingested row(s).", removed)
        skip_ids = existing_external_ids(sb)
        logger.info("Catalog already has %d ingested item(s) — those will be skipped.", len(skip_ids))

    budget = Budget(
        total=args.limit,
        per_category=args.per_category,
        per_article=args.per_article,
    )

    targets = ARTICLE_TARGETS
    if args.only:
        only = {a.strip().lower() for a in args.only.split(",") if a.strip()}
        targets = [t for t in targets if t[1].lower() in only]

    pending: List[Dict[str, Any]] = []
    inserted = 0
    skipped_no_image = 0
    seen_here: Set[str] = set()
    started = time.time()

    for sub_category, article_type in targets:
        if budget.full():
            break
        offset = 0
        article_start = budget.article_counts.get(article_type, 0)
        while not budget.full():
            try:
                rows, total = fetch_rows(article_type, offset)
            except Exception as exc:
                logger.warning("Query failed for %s at offset %d: %s", article_type, offset, exc)
                break
            if not rows:
                break

            added_this_page = 0
            for raw in rows:
                external_id = str(raw.get("id") or "").strip()
                if not external_id or external_id in skip_ids or external_id in seen_here:
                    continue

                normalized = normalize_row(raw, source=SOURCE, external_id=external_id)
                category = normalized["category"]
                if category not in CATEGORIES:
                    continue
                if not budget.accept(category, normalized.get("subcategory")):
                    continue

                seen_here.add(external_id)
                added_this_page += 1
                if args.dry_run:
                    continue

                image_url = None
                if not args.no_images:
                    img_src = _image_url(raw)
                    data = download_image(img_src) if img_src else None
                    if data:
                        image_url = upload_image(sb, external_id, data)
                if not image_url:
                    if args.require_image:
                        skipped_no_image += 1
                        budget.accepted -= 1  
                        continue
                    image_url = ""

                row = {**normalized}
                row["image_url"] = image_url
                row["thumbnail_url"] = image_url or None
                pending.append(row)

                if len(pending) >= INSERT_BATCH:
                    inserted += flush(sb, pending)
                    pending = []
                    logger.info(
                        "  inserted %d / %d (%.0fs)",
                        inserted + len(pending),
                        budget.accepted,
                        time.time() - started,
                    )

          
            article_now = budget.article_counts.get(article_type, 0)
            if added_this_page == 0 or article_now >= args.per_article:
                break
            offset += len(rows)
            if offset >= total:
                break

    if pending:
        inserted += flush(sb, pending)

    elapsed = time.time() - started
    if args.dry_run:
        logger.info("DRY RUN — nothing written. Planned distribution (%ds):", int(elapsed))
    else:
        logger.info("Inserted %d new catalog row(s) in %.0fs (%d skipped: no image).", inserted, elapsed, skipped_no_image)
    for category in CATEGORIES:
        count = budget.cat_counts.get(category, 0)
        if count:
            logger.info("  %-12s %d", category, count)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Ingest a fashion dataset into public.clothing.")
    parser.add_argument("--limit", type=int, default=1200, help="Max rows to ingest (default 1200).")
    parser.add_argument("--per-category", type=int, default=400, help="Max rows per catalog category.")
    parser.add_argument("--per-article", type=int, default=60, help="Max rows per article type.")
    parser.add_argument("--only", type=str, default="", help="Comma-separated article types to limit to.")
    parser.add_argument("--reset", action="store_true", help="Delete previously ingested rows first.")
    parser.add_argument("--dry-run", action="store_true", help="Normalize + count only; write nothing.")
    parser.add_argument("--no-images", action="store_true", help="Skip image download/upload (metadata only).")
    parser.add_argument(
        "--require-image",
        action="store_true",
        help="Skip any item whose image could not be downloaded/uploaded.",
    )
    return parser


if __name__ == "__main__":
    raise SystemExit(run(build_parser().parse_args()))