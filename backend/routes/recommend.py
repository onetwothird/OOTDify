"""Recommendation routes.

POST /api/recommend — deterministic composer over the real catalog
(see services/recommender_service.py). Returns real catalog ids with scores;
the mobile app renders whatever ids come back.

The recommendation output is the documented AI integration point: swap the
scorer for a model-based system while keeping the same contract.
"""
from __future__ import annotations

import logging
from typing import Optional

from flask import Blueprint, jsonify, request

from services.auth_service import require_auth, require_user
from services.ratelimit import default_limits
from services.recommender_service import recommend
from services.supabase_client import get_supabase
from routes.users import ensure_profile

logger = logging.getLogger(__name__)

recommend_bp = Blueprint("recommend", __name__)

_VALID_OCCASIONS = {
    "Casual", "School", "Office", "Interview", "Date",
    "Formal", "Party", "Travel", "Gym", "Beach",
}


@recommend_bp.post("/api/recommend")
@require_auth
@default_limits("recommend")
def recommend_endpoint():
    user = require_user()
    payload = request.get_json(silent=True) or {}
    occasion = str(payload.get("occasion") or "").strip()
    if occasion and occasion not in _VALID_OCCASIONS:
        return jsonify(success=False, error=f"Unknown occasion '{occasion}'."), 400

    try:
        limit = max(1, min(int(payload.get("limit") or 8), 30))
    except (TypeError, ValueError):
        limit = 8

    profile = ensure_profile(user["id"])

    # Load the catalog (service-role read; the UI also has RLS read access).
    rows = (
        get_supabase()
        .table("clothing")
        .select("*")
        .order("created_at")
        .execute()
        .data
    )
    if not rows:
        return jsonify(success=True, recommendations=[], occasion=occasion or None)

    items = recommend(rows, profile, occasion or None, limit=limit)
    logger.info("Recommended %d item(s) for user %s (occasion=%s)", len(items), user["id"], occasion or "none")
    return jsonify(success=True, recommendations=items, occasion=occasion or None)