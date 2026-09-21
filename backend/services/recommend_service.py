"""Outfit recommendation service.

Turns the user's wardrobe + occasion + weather into concrete outfit
suggestions *server-side*, so the mobile app receives real clothing IDs it can
render. Today this is a transparent rule-based matcher (category pairing +
weather awareness). The interface is designed so a trained model / LLM can be
dropped in later without touching the routes or the app: `generate()` is the
single entry point.

No fake data: every returned item is one of the items the client sent, and
never an ID that doesn't exist in the caller's wardrobe.
"""
from __future__ import annotations

import logging
import random
import time
import uuid
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Recommended maximum items per outfit (top, bottom, shoes + optional outerwear).
MAX_ITEMS = 4


# --------------------------------------------------------------------------
# Rule-based scoring (deterministic variant of the client compatibility score)
# --------------------------------------------------------------------------
def score_items(items: List[dict]) -> int:
    """0-100 heuristic: coverage of core categories lowers when gaps exist."""
    if not items:
        return 0
    cats = {(i.get("category") or "").lower() for i in items}
    has_top = any("top" in c for c in cats)
    has_bottom = any(("bottom" in c) or ("pant" in c) or ("jean" in c) or ("short" in c) or ("skirt" in c) for c in cats)
    has_shoe = any(("shoe" in c) or ("boot" in c) or ("sneaker" in c) or ("kick" in c) for c in cats)
    score = 40  # baseline for a non-empty pick
    if has_top:
        score += 25
    if has_bottom:
        score += 25
    if has_shoe:
        score += 10
    return min(100, score)


def _reason(items: List[dict], occasion: Optional[str]) -> str:
    cats = {(i.get("category") or "").lower() for i in items}
    top = any("top" in c for c in cats)
    bottom = any("bottom" in c or "pant" in c or "jean" in c or "short" in c or "skirt" in c for c in cats)
    shoe = any("shoe" in c or "boot" in c or "sneaker" in c for c in cats)
    parts = [f"for {occasion}" if occasion else "for today"]
    if top:
        parts.append("a top")
    if bottom:
        parts.append("bottom")
    if shoe:
        parts.append("shoes")
    return "Paired " + ", ".join(parts) + " from your wardrobe."


def _build_one(
    pool: List[dict],
    occasion: Optional[str],
    is_hot: bool,
    is_cold: bool,
    rng: random.Random,
) -> dict:
    """Pick one outfit from the pool (one item per core category)."""
    used: List[str] = []
    picked: List[dict] = []

    def by_category(*keywords: str) -> List[dict]:
        return [
            i
            for i in pool
            if i.get("id") not in used
            and any(k in (i.get("category") or "").lower() for k in keywords)
        ]

    def add_first(candidates: List[dict]) -> bool:
        if not candidates:
            return False
        choice = rng.choice(candidates)
        picked.append(choice)
        used.append(str(choice.get("id")))
        return True

    add_first(by_category("top"))
    add_first(by_category("bottom", "pant", "jean", "short", "skirt"))
    add_first(by_category("shoe", "boot", "sneaker"))
    if is_cold:
        add_first(by_category("outer", "jacket", "jacket", "hoodie", "sweater"))
    if is_hot:
        # On hot days avoid heavy layers; nothing extra needed here.
        pass

    # Fill remaining slots up to MAX_ITEMS from whatever is left.
    remaining = [i for i in pool if str(i.get("id")) not in used]
    while len(picked) < MAX_ITEMS and remaining:
        choice = rng.choice(remaining)
        remaining = [i for i in remaining if str(i.get("id")) != str(choice.get("id"))]
        picked.append(choice)
        used.append(str(choice.get("id")))

    return {
        "id": f"outfit-{uuid.uuid4().hex[:10]}",
        "items": picked,
        "score": score_items(picked),
        "reason": _reason(picked, occasion),
        "occasion": occasion,
    }


def generate(
    items: List[dict],
    occasion: Optional[str] = None,
    weather: Optional[Dict[str, Any]] = None,
    count: int = 5,
    seed: Optional[int] = None,
) -> List[dict]:
    """Build up to `count` distinct outfits from the given wardrobe items.

    Args:
        items: wardrobe items as sent by the client (must include id, category,
            name and image(s)).
        occasion: e.g. "Casual", "Work", "Date".
        weather: {"tempC": float, "condition": str} for hot/cold awareness.
        count: number of outfit suggestions desired.
        seed: optional RNG seed (deterministic output for tests).
    """
    if not items:
        return []

    temp = None
    if weather:
        try:
            temp = float(weather.get("tempC"))
        except (TypeError, ValueError):
            temp = None
    is_cold = temp is not None and temp <= 10
    is_hot = temp is not None and temp >= 25

    # On hot days, drop heavy outerwear from the pool entirely.
    pool = (
        [i for i in items if not ("outer" in (i.get("category") or "").lower())]
        if is_hot
        else items
    )
    pool = pool or items

    rng = random.Random(seed)  # seed=None → non-deterministic

    outfits: List[dict] = []
    seen: set = set()
    for _ in range(max(1, count)):
        outfit = _build_one(pool, occasion, is_hot, is_cold, rng)
        key = tuple(sorted(str(i.get("id")) for i in outfit["items"]))
        if key in seen:
            continue
        seen.add(key)
        outfits.append(outfit)
        if len(outfits) >= count:
            break

    return outfits