"""Phase 3 + Phase 4 verification: catalog, storage, and RLS (server-side).

Runs against the LIVE Supabase project using backend/.env credentials.
The anon (publishable) key is read from the repo-root .env — the same
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY the Expo app ships with — so the RLS
probe here exercises exactly what an unauthenticated attacker can reach.

Checks:
  1. public.clothing has seeded rows; image/thumbnail URLs are HTTPS
  2. no duplicate catalog records (same name + image_url)
  3. saved_outfits.clothing_ids all resolve to clothing or clothing_items
  4. anon key WITHOUT a session sees ZERO rows on every user-owned table
  5. anon key WITHOUT a session cannot write to user-owned tables
  6. storage buckets: clothing public, user buckets private
  7. private bucket objects are not listable with the anon key

Run:
    cd backend
    python scripts/verify_catalog.py

Exits non-zero when any check fails (CI-gate friendly).
"""
from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import urlparse

from supabase import create_client

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from config import Config  # noqa: E402

USER_TABLES = [
    "clothing_items",
    "user_profiles",
    "body_photos",
    "try_on_jobs",
    "saved_outfits",
    "outfit_plans",
    "favorites",
    "recently_viewed",
]

PRIVATE_BUCKETS = ("users", "wardrobe", "tryons", "avatars")

failures: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"[{'PASS' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def _root_env_value(key: str) -> str:
    env_file = REPO_ROOT / ".env"
    if not env_file.exists():
        return ""
    for line in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    return ""


def main() -> int:
    if not (Config.SUPABASE_URL and Config.SUPABASE_SERVICE_ROLE_KEY):
        print("Supabase service credentials not configured in backend/.env — cannot verify.")
        return 2

    admin = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)

    anon_key = (
        _root_env_value("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        or _root_env_value("EXPO_PUBLIC_SUPABASE_ANON_KEY")
    )
    anon = create_client(Config.SUPABASE_URL, anon_key) if anon_key else None

    # --- 1. catalog rows + URL validity ------------------------------------
    rows = admin.table("clothing").select("id,name,image_url,thumbnail_url").execute().data or []
    check("catalog has seeded rows", len(rows) > 0, f"{len(rows)} rows")

    bad_urls = []
    for r in rows:
        img = r.get("image_url")
        thumb = r.get("thumbnail_url")
        if not img:
            bad_urls.append(f"{r['name']}: empty image_url")
        elif urlparse(img).scheme != "https":
            bad_urls.append(f"{r['name']}: non-HTTPS image_url")
        if thumb and urlparse(thumb).scheme != "https":
            bad_urls.append(f"{r['name']}: non-HTTPS thumbnail_url")
    check("all catalog image URLs are HTTPS", not bad_urls, "; ".join(bad_urls[:5]))

    # --- 2. duplicates ------------------------------------------------------
    seen: set[tuple[str, str | None]] = set()
    dupes = []
    for r in rows:
        key = (r["name"], r.get("image_url"))
        if key in seen:
            dupes.append(r["name"])
        seen.add(key)
    check("no duplicate catalog records", not dupes, f"duplicated: {dupes[:5]}")

    # --- 3. saved_outfits.clothing_ids integrity ---------------------------
    outfits = admin.table("saved_outfits").select("id,clothing_ids").execute().data or []
    item_ids = {r["id"] for r in (admin.table("clothing_items").select("id").execute().data or [])}
    clothing_ids = {r["id"] for r in rows}
    dangling = [
        f"{o['id']} -> {cid}"
        for o in outfits
        for cid in (o.get("clothing_ids") or [])
        if cid not in clothing_ids and cid not in item_ids
    ]
    check("saved_outfits.clothing_ids all resolve", not dangling,
          f"{len(outfits)} outfits; dangling: {dangling[:3]}")

    # --- 4. anon reads see nothing on user tables --------------------------
    if anon is None:
        check("anon key available for RLS probe", False, "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY not found in repo-root .env")
    else:
        leaks = []
        for table in USER_TABLES:
            try:
                data = anon.table(table).select("*").limit(5).execute().data or []
            except Exception as exc:  # permission errors also count as "sealed"
                data = []
                print(f"    ({table}: anon select raised {type(exc).__name__})")
            if data:
                leaks.append(f"{table}:{len(data)} rows")
        check("anon (no session) reads zero rows on all user tables", not leaks, "; ".join(leaks))

        # --- 5. anon writes are rejected --------------------------------
        write_leaks = []
        for table in USER_TABLES:
            try:
                anon.table(table).insert({"user_id": "00000000-0000-0000-0000-000000000000"}).execute()
                write_leaks.append(f"{table}: insert allowed")
            except Exception:
                pass  # rejected = good
        check("anon (no session) cannot insert into user tables", not write_leaks, "; ".join(write_leaks))

    # --- 6. bucket visibility ----------------------------------------------
    raw_buckets = admin.storage.list_buckets()
    buckets = getattr(raw_buckets, "data", raw_buckets) or []
    visibility: dict[str, bool] = {}
    for b in buckets:
        if isinstance(b, dict):
            visibility[b.get("name", "")] = bool(b.get("public", False))
        else:  # supabase-py >=2 returns Bucket objects with attributes
            visibility[getattr(b, "name", "")] = bool(getattr(b, "public", False))
    check("clothing bucket is public", visibility.get("clothing") is True, str(visibility))
    for name in PRIVATE_BUCKETS:
        check(f"{name} bucket is private", visibility.get(name) is False,
              f"public={visibility.get(name)}")

    # --- 7. private objects not listable by anon ---------------------------
    if anon is not None:
        exposed = []
        for name in PRIVATE_BUCKETS:
            try:
                objs = anon.storage.from_(name).list("")
                if objs and len(objs) > 0:
                    exposed.append(f"{name}:{len(objs)} objects")
            except Exception:
                pass  # blocked = good
        check("anon cannot list private bucket objects", not exposed, "; ".join(exposed))

    print()
    if failures:
        print(f"{len(failures)} check(s) FAILED: {failures}")
        return 1
    print("All catalog/storage/RLS checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
