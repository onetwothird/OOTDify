"""Server-side outfit composer.

Turns scored catalog rows into complete, ready-to-render *looks* — one top, one
bottom, shoes, and (when it's cold) a layer. This is the engine behind
`POST /api/outfits` and the AI Picker screen.

Design goals:
  * Real ids only — every returned item is a row the caller already has.
  * Deterministic for a given seed (so tests and "shuffle" are reproducible).
  * Honest about gaps: an outfit reports which core slots the catalog could not
    fill instead of inventing items.
  * Weather-aware: no heavy layers on hot days, layers encouraged when cold.

Pure Python (no Flask, no Supabase): the route injects the catalog rows.
"""
from __future__ import annotations

import hashlib
import random
from typing import Any, Dict, Iterable, List, Optional, Sequence

# Core slots, in the order they read best in the UI.
CORE_SLOTS = ("top", "bottom", "shoes", "outer")
OPTIONAL_SLOTS = ("dress", "bag", "accessory")

MAX_ITEMS = 6

# How many of a slot's best-scored candidates to sample from. Larger → more
# variety between generated looks; smaller → stronger preference for the best.
_SAMPLE_WIDTH = 6


# ---------------------------------------------------------------------------
# Category → slot
# ---------------------------------------------------------------------------
def slot_of(item: Dict[str, Any]) -> str:
    """Map a catalog row's category to a composition slot."""
    text = " ".join(
        str(item.get(key) or "").lower()
        for key in ("category", "subcategory")
    )
    if "dress" in text:
        return "dress"
    if "top" in text:
        return "top"
    if any(k in text for k in ("bottom", "pant", "jean", "short", "skirt", "trouser")):
        return "bottom"
    if any(k in text for k in ("shoe", "boot", "sneaker", "sandal", "heel", "flat")):
        return "shoes"
    if any(k in text for k in ("outer", "jacket", "coat", "blazer")):
        return "outer"
    if "bag" in text or "backpack" in text:
        return "bag"
    return "accessory"


def bucket_items(items: Sequence[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for item in items:
        buckets.setdefault(slot_of(item), []).append(item)
    return buckets


# ---------------------------------------------------------------------------
# Scoring & copy
# ---------------------------------------------------------------------------
def _item_score(item: Dict[str, Any]) -> float:
    try:
        return float(item.get("score") or 0.0)
    except (TypeError, ValueError):
        return 0.0


def score_outfit(picked: Sequence[Dict[str, Any]]) -> int:
    """0–100 coverage score for a composed look."""
    if not picked:
        return 0
    slots = {slot_of(i) for i in picked}
    score = 35
    if "dress" in slots:
        score += 30
    else:
        if "top" in slots:
            score += 20
        if "bottom" in slots:
            score += 20
    if "shoes" in slots:
        score += 15
    if "outer" in slots:
        score += 8
    if slots & {"bag", "accessory"}:
        score += 5
    return min(100, score)


_SLOT_LABEL = {
    "top": "a top",
    "bottom": "bottoms",
    "shoes": "shoes",
    "outer": "a layer",
    "dress": "a dress",
    "bag": "a bag",
    "accessory": "an accessory",
}


def _reason(picked: Sequence[Dict[str, Any]], occasion: Optional[str]) -> str:
    slots = [slot_of(i) for i in picked]
    # Preserve a readable, deduped order.
    ordered: List[str] = []
    for slot in ("dress", "top", "bottom", "shoes", "outer", "bag", "accessory"):
        if slot in slots and slot not in ordered:
            ordered.append(slot)
    labels = [_SLOT_LABEL[s] for s in ordered]
    where = f"for {occasion}" if occasion else "for today"
    if not labels:
        return "Picked pieces from the catalog."
    if len(labels) == 1:
        joined = labels[0]
    else:
        joined = ", ".join(labels[:-1]) + f" and {labels[-1]}"
    return f"Paired {joined} {where}."


def missing_slots(picked: Sequence[Dict[str, Any]], *, is_hot: bool, is_cold: bool) -> List[str]:
    """Which core slots the look could not fill (for honest UI hints)."""
    slots = {slot_of(i) for i in picked}
    missing: List[str] = []
    if "dress" not in slots:
        if "top" not in slots:
            missing.append("top")
        if "bottom" not in slots:
            missing.append("bottom")
    if "shoes" not in slots:
        missing.append("shoes")
    if is_cold and "outer" not in slots:
        missing.append("outer")
    return missing


# ---------------------------------------------------------------------------
# Picking
# ---------------------------------------------------------------------------
def _pick(
    candidates: Optional[List[Dict[str, Any]]],
    rng: random.Random,
    used_ids: set,
) -> Optional[Dict[str, Any]]:
    """Choose one candidate, preferring higher-scored and not-yet-used items."""
    if not candidates:
        return None
    ranked = sorted(
        candidates,
        key=lambda i: (-_item_score(i), str(i.get("id") or "")),
    )
    fresh = [i for i in ranked if str(i.get("id")) not in used_ids]
    pool = fresh or ranked
    return rng.choice(pool[:_SAMPLE_WIDTH])


def _compose_one(
    buckets: Dict[str, List[Dict[str, Any]]],
    rng: random.Random,
    *,
    is_hot: bool,
    is_cold: bool,
    used_across: set,
) -> List[Dict[str, Any]]:
    picked: List[Dict[str, Any]] = []
    used_here: set = set()

    def take(slot: str) -> Optional[Dict[str, Any]]:
        if len(picked) >= MAX_ITEMS:
            return None
        chosen = _pick(buckets.get(slot), rng, used_here | used_across)
        if chosen is None:
            chosen = _pick(buckets.get(slot), rng, used_here)
        if chosen is not None:
            picked.append(chosen)
            used_here.add(str(chosen.get("id")))
        return chosen

    has_dress = bool(buckets.get("dress"))
    has_separates = bool(buckets.get("top")) and bool(buckets.get("bottom"))

    # A dress look only when we have a dress pool (and randomly prefer it).
    dress_look = has_dress and (not has_separates or rng.random() < 0.35)

    if dress_look:
        take("dress")
    else:
        take("top")
        take("bottom")
        if not picked and has_dress:  # separates empty → fall back to a dress
            take("dress")

    take("shoes")
    if is_cold:
        take("outer")
    elif not is_hot and buckets.get("outer") and rng.random() < 0.25:
        take("outer")  # mild days may still add a light layer

    if rng.random() < 0.7:
        take("bag")
    if rng.random() < 0.5:
        take("accessory")

    return picked


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def compose(
    items: List[Dict[str, Any]],
    occasion: Optional[str] = None,
    weather: Optional[Dict[str, Any]] = None,
    count: int = 3,
    seed: Optional[int] = None,
    gender: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Compose up to `count` distinct outfits from the given catalog rows.

    Args:
        items: catalog rows (expects id, category, name, image_url, optional score).
        occasion: display/context label, e.g. "Casual".
        weather: {"tempC": float, "condition": str} for hot/cold awareness.
        count: number of looks desired.
        seed: RNG seed (deterministic output; None → time-based).
        gender: optional "men" | "women" | "unisex" filter (unisex always fits).
    """
    if not items:
        return []

    pool: Iterable[Dict[str, Any]] = items
    if gender in ("men", "women"):
        pool = [
            i
            for i in pool
            if (i.get("gender") or "unisex").lower() in ("unisex", gender)
        ]
    pool = list(pool) or list(items)

    temp: Optional[float] = None
    if weather:
        try:
            temp = float(weather.get("tempC"))
        except (TypeError, ValueError):
            temp = None
    is_cold = temp is not None and temp <= 10
    is_hot = temp is not None and temp >= 25

    if is_hot:
        pool = [i for i in pool if slot_of(i) != "outer"] or pool

    buckets = bucket_items(pool)
    # Nothing usable to combine.
    if not any(buckets.get(slot) for slot in CORE_SLOTS + ("dress",)):
        return []

    rng = random.Random(seed)
    outfits: List[Dict[str, Any]] = []
    seen: set = set()
    used_across: set = set()

    target = max(1, int(count))
    # Bounded attempts so a tiny catalog can't spin forever.
    for _ in range(target * 6):
        if len(outfits) >= target:
            break
        picked = _compose_one(
            buckets, rng, is_hot=is_hot, is_cold=is_cold, used_across=used_across
        )
        if not picked:
            break
        key = tuple(sorted(str(i.get("id")) for i in picked))
        if key in seen:
            continue
        seen.add(key)
        for item in picked:
            used_across.add(str(item.get("id")))
        # Deterministic id — same seed + same items → same id (testable, cacheable).
        digest = hashlib.blake2s(
            f"{seed}:{','.join(key)}".encode("utf-8"), digest_size=5
        ).hexdigest()
        outfits.append(
            {
                "id": f"outfit-{digest}",
                "items": picked,
                "score": score_outfit(picked),
                "reason": _reason(picked, occasion),
                "occasion": occasion,
                "missing": missing_slots(picked, is_hot=is_hot, is_cold=is_cold),
            }
        )

    outfits.sort(key=lambda o: (-o["score"], o["id"]))
    return outfits
