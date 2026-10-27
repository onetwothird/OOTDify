"""Catalog read helpers for the recommendation endpoints.

The shared catalog (`public.clothing`) can hold tens of thousands of rows. A
single `select("*")` would hit PostgREST's max-rows cap and skew results toward
whatever happened to be inserted first, so we load a bounded, *category-balanced*
slice instead: a handful of candidates per catalog category. That guarantees the
composer always sees tops, bottoms, shoes, outerwear, dresses and accessories —
even when one category dominates the table.

Service-role read (the backend is the trusted server); the caller must already
be authenticated before calling these helpers.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Sequence

from services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# Categories a composed look can draw from. Order matters only for logging.
CANDIDATE_CATEGORIES: Sequence[str] = (
    "Tops",
    "Bottoms",
    "Shoes",
    "Outerwear",
    "Dresses",
    "Bags",
    "Accessories",
)

DEFAULT_PER_CATEGORY = 200


def load_candidates(per_category: int = DEFAULT_PER_CATEGORY) -> List[dict]:
    """Return up to `per_category` rows for each catalog category (balanced)."""
    sb = get_supabase()
    rows: List[dict] = []
    seen: set = set()
    for category in CANDIDATE_CATEGORIES:
        try:
            result = (
                sb.table("clothing")
                .select("*")
                .eq("category", category)
                .limit(max(1, int(per_category)))
                .execute()
            )
        except Exception:  # network / PostgREST hiccup on one category shouldn't kill all
            logger.exception("Catalog fetch failed for category %s", category)
            continue
        for row in result.data or []:
            row_id = str(row.get("id"))
            if row_id and row_id not in seen:
                seen.add(row_id)
                rows.append(row)
    return rows


def catalog_stats(rows: Sequence[dict]) -> Dict[str, int]:
    """Count rows per category — handy for logs and honest empty-state copy."""
    stats: Dict[str, int] = {}
    for row in rows:
        key = str(row.get("category") or "Other")
        stats[key] = stats.get(key, 0) + 1
    return stats


# --------------------------------------------------------------------------
# The user's own closet (public.clothing_items) as recommendation candidates
# --------------------------------------------------------------------------
DEFAULT_CLOSET_LIMIT = 500


def closet_row_to_candidate(row: dict) -> dict:
    """A `clothing_items` row in the candidate shape the scorer/composer read.

    Closet rows store one colour and one size as text and have no gender, so
    they are normalized to the catalog's list fields. Missing values become
    empty lists, never placeholders.
    """
    category = row.get("category") or None
    color = row.get("color")
    size = row.get("size")
    return {
        "id": str(row.get("id")),
        "name": row.get("name") or category or "Item",
        "category": category,
        "subcategory": None,
        "gender": "unisex",
        "color": [color] if color else [],
        "sizes": [size] if size else [],
        "style": row.get("style") or None,
        "brand": row.get("brand") or None,
        "occasion": list(row.get("occasion") or []),
        "image_url": row.get("image_url") or None,
        "source": "closet",
    }


def load_closet_candidates(user_id: str, limit: int = DEFAULT_CLOSET_LIMIT) -> List[dict]:
    """The given user's closet items as candidates (service-role, owner-scoped).

    `user_id` must come from the validated session token, never the request.
    """
    result = (
        get_supabase()
        .table("clothing_items")
        .select("id, name, category, color, size, style, brand, occasion, image_url")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(max(1, int(limit)))
        .execute()
    )
    return [closet_row_to_candidate(row) for row in result.data or []]
