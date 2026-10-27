"""Outfit routes.

POST /api/outfits — returns complete, ready-to-render looks composed from the
caller's own closet (see services/outfit_service.py). Each look is a list of
the user's real `clothing_items` with a coverage score and a plain-language
reason.

This is the documented AI integration point for *looks* (as opposed to
/api/recommend, which returns a flat list of scored items): swap the composer
for a model-based system while keeping the same contract. The mobile app renders
whatever item ids come back — never anything invented.
"""
from __future__ import annotations

import logging
import time

from flask import Blueprint, jsonify, request

from routes.users import ensure_profile
from services.auth_service import require_auth, require_user
from services.catalog_service import catalog_stats, load_closet_candidates
from services.outfit_service import compose
from services.ratelimit import default_limits
from services.recommender_service import recommend as rank_items

logger = logging.getLogger(__name__)

outfits_bp = Blueprint("outfits", __name__)

_VALID_OCCASIONS = {
    "Casual", "School", "Office", "Interview", "Date",
    "Formal", "Party", "Travel", "Gym", "Beach",
}

_VALID_GENDERS = {"men", "women", "unisex"}


@outfits_bp.post("/api/outfits")
@require_auth
@default_limits("outfits")
def outfits_endpoint():
    user = require_user()
    payload = request.get_json(silent=True) or {}

    occasion = str(payload.get("occasion") or "").strip()
    if occasion and occasion not in _VALID_OCCASIONS:
        return jsonify(success=False, error=f"Unknown occasion '{occasion}'."), 400

    gender = str(payload.get("gender") or "").strip().lower()
    if gender and gender not in _VALID_GENDERS:
        return jsonify(success=False, error=f"Unknown gender '{gender}'."), 400
    gender = gender or None

    try:
        count = max(1, min(int(payload.get("count") or 3), 8))
    except (TypeError, ValueError):
        count = 3

    weather = payload.get("weather") if isinstance(payload.get("weather"), dict) else None
    if weather and weather.get("tempC") is not None:
        try:
            weather = {**weather, "tempC": float(weather["tempC"])}
        except (TypeError, ValueError):
            weather = None

    profile = ensure_profile(user["id"])

    rows = load_closet_candidates(user["id"])
    if not rows:
        return jsonify(
            success=True,
            outfits=[],
            occasion=occasion or None,
            pool=0,
            reason="Your closet is empty. Capture a few clothes first.",
        )

    # Rank the closet against the user's style profile, then compose.
    ranked = rank_items(rows, profile, occasion or None, limit=len(rows))
    # Compose fresh looks each request unless the caller pins a seed.
    seed = payload.get("seed")
    try:
        seed = int(seed) if seed is not None else int(time.time() // 60)
    except (TypeError, ValueError):
        seed = int(time.time() // 60)

    outfits = compose(
        ranked,
        occasion=occasion or None,
        weather=weather,
        count=count,
        seed=seed,
        gender=gender,
    )

    logger.info(
        "Composed %d outfit(s) for user %s (occasion=%s, pool=%d, stats=%s)",
        len(outfits),
        user["id"],
        occasion or "none",
        len(ranked),
        catalog_stats(ranked),
    )
    return jsonify(
        success=True,
        outfits=outfits,
        occasion=occasion or None,
        weather=weather,
        pool=len(ranked),
    )
