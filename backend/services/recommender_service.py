"""Deterministic, privacy-friendly outfit recommender.

Scores the shared catalog against the user's stored fashion profile using
explicit rule weights. There is NO tracking of user behavior beyond what the
user opts into (profile fields + optional occasion), and no external AI is
involved: this is a pure function that produces real catalog ids.

Scoring (all additive, then normalised 0..1 for display):
  +3   occasion matches item.occasion
  +2   per preferred_style match
  +1   per preferred_color match
  +1   category in preferred_categories
  +1   gender compatible (item gender == 'unisex' or matches profile gender)
  -0.5 per size mismatch in the same category (soft penalty)

The AI integration point is documented in README: replace this composer with
a model-based scorer while keeping the same signature and keeping the *catalog
id* as the output — the UI already renders whatever ids come back.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


def _norm_style(value: str) -> str:
    return (value or "").strip().lower()


def _overlap(left: List[str], right: List[str]) -> int:
    a = {_norm_style(v) for v in left if v}
    b = {_norm_style(v) for v in right if v}
    return len(a & b)


def score_item(item: dict, profile: dict, occasion: Optional[str] = None) -> float:
    """Return the deterministic score for one catalog item (0..~10)."""
    score = 0.0

    # Occasion fit — the strongest signal when a user asks for one.
    item_occasions: List[str] = item.get("occasion") or []
    if occasion:
        score += 3.0 * _overlap([occasion], item_occasions)

    # Style preference
    preferred_styles: List[str] = profile.get("preferred_styles") or []
    item_styles: List[str] = [item.get("style")] if item.get("style") else []
    score += 2.0 * _overlap(preferred_styles, item_styles)

    # Color preference
    preferred_colors: List[str] = profile.get("preferred_colors") or []
    item_colors: List[str] = item.get("color") or []
    score += 1.0 * _overlap(preferred_colors, item_colors)

    # Category preference
    preferred_categories: List[str] = profile.get("preferred_categories") or []
    if item.get("category") and _norm_style(item["category"]) in {
        _norm_style(c) for c in preferred_categories
    }:
        score += 1.0

    # Gender compatibility (unisex always fits)
    profile_gender = _norm_style(profile.get("gender") or "")
    item_gender = _norm_style(item.get("gender") or "unisex")
    if item_gender == "unisex":
        score += 1.0
    elif profile_gender and item_gender == profile_gender:
        score += 1.0
    elif profile_gender:
        score -= 0.5  # soft mismatch, still returnable

    # (Optional) size compatibility penalty
    if profile.get("sizes") and item.get("sizes"):
        try:
            preferred_sizes = {_norm_style(s) for s in profile["sizes"]}
            item_sizes = {_norm_style(s) for s in item["sizes"]}
            if preferred_sizes and item_sizes and not preferred_sizes & item_sizes:
                score -= 0.5
        except Exception:
            pass

    return round(max(score, 0.0), 3)


def recommend(
    catalog_items: List[dict],
    profile: dict,
    occasion: Optional[str] = None,
    limit: int = 8,
) -> List[dict]:
    """Score the catalog and return the top `limit` items, highest score first.

    Each output dict is the original item dict plus a "score" and a
    "score_normalized" (0..1 relative to the top item) field.
    """
    if not catalog_items:
        return []

    scored = [
        {**item, "score": score_item(item, profile, occasion)}
        for item in catalog_items
    ]
    scored.sort(key=lambda i: (-i["score"], (i.get("name") or "").lower()))

    top_score = scored[0]["score"] if scored else 1.0
    for item in scored:
        item["score_normalized"] = round(
            item["score"] / top_score, 3
        ) if top_score > 0 else 0.0

    return scored[: max(1, int(limit))]