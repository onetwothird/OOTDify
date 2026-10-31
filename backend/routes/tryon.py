"""Try-on job routes.

The mobile app creates jobs here; the background worker (see
services/tryon_service.py) processes them; the app polls GET /api/tryon/<id>
until status is completed | failed. Retries are honoured for failed jobs —
there is deliberately NO mock: a job fails honestly with an error message
until a real VTON model is deployed.

Ownership: every job lookup is filtered by the authenticated user id, and the
body photo used to create a job must belong to the same user.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from flask import Blueprint, jsonify, request

from config import Config
from services import storage_service
from services.auth_service import require_auth, require_user
from services.consent import require_consent
from services.ratelimit import default_limits, upload_limits
from services.supabase_client import get_supabase
from services.gemini_tryon import is_preset
from services.tryon_service import TryOnJobStore

logger = logging.getLogger(__name__)

tryon_bp = Blueprint("tryon", __name__)

_store_instance: Optional[TryOnJobStore] = None


def _store() -> TryOnJobStore:
    """Lazy job store (client is created on first use, not at import time).

    NOTE: the cached instance lives in `_store_instance` — if it shared the
    function's name, `_store()` would return the function itself and every call
    would crash with AttributeError.
    """
    global _store_instance
    if _store_instance is None:
        _store_instance = TryOnJobStore()
    return _store_instance


def _public_job(job: dict) -> dict:
    """Attach a short-lived signed URL for completed results."""
    out = dict(job)
    if job.get("status") == "completed" and job.get("result_url"):
        try:
            out["resultSignedUrl"] = storage_service.signed_url(
                job["result_url"], Config.SIGNED_URL_EXPIRY_SECONDS
            )
        except Exception:
            out["resultSignedUrl"] = None
    return out


@tryon_bp.post("/api/tryon")
@require_auth
@upload_limits("tryon_create")
@require_consent
def create_tryon():
    user = require_user()
    payload = request.get_json(silent=True) or {}
    body_photo_id = str(payload.get("body_photo_id") or "").strip() or None
    model_preset = str(payload.get("model_preset") or "").strip() or None
    clothing_ids: List[str] = [
        str(c).strip() for c in (payload.get("clothing_ids") or []) if str(c).strip()
    ]

    # The wearer is the user's own photo or a preset model, never both.
    if not clothing_ids or bool(body_photo_id) == bool(model_preset):
        return (
            jsonify(success=False, error="clothing_ids and one of body_photo_id or model_preset are required."),
            400,
        )
    if len(clothing_ids) > 10:
        return jsonify(success=False, error="Too many clothing items (max 10)."), 400
    if model_preset and not is_preset(model_preset):
        return jsonify(success=False, error="Unknown model."), 400

    # Each picture costs real money: a per-user cap over the last 24 hours.
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    if _store().count_since(user["id"], since) >= Config.TRYON_DAILY_LIMIT:
        return jsonify(success=False, error="You've used today's try-ons. Come back tomorrow."), 429

    # Ownership: the body photo must belong to the authenticated user.
    if body_photo_id and not _owns_body_photo(user["id"], body_photo_id):
        return jsonify(success=False, error="Body photo not found."), 404

    # Validate clothing ids exist (catalog OR user's own wardrobe items).
    missing = _validate_clothing_ids(user["id"], clothing_ids)
    if missing:
        return (
            jsonify(
                success=False,
                error="Some clothing items do not exist or are not yours.",
                missing=missing,
            ),
            400,
        )

    job = _store().create(user["id"], body_photo_id, clothing_ids, model_preset=model_preset)
    logger.info(
        "Try-on job %s queued for user %s (%d item(s), %s)",
        job["id"],
        user["id"],
        len(clothing_ids),
        "preset" if model_preset else "own photo",
    )
    return jsonify(success=True, job=_public_job(job)), 201


@tryon_bp.get("/api/tryon")
@require_auth
@default_limits("tryon_list")
def list_tryons():
    user = require_user()
    jobs = _store().list_for_user(user["id"])
    return jsonify(success=True, jobs=[_public_job(j) for j in jobs])


@tryon_bp.get("/api/tryon/<job_id>")
@require_auth
@default_limits("tryon_read")
def get_tryon(job_id: str):
    user = require_user()
    job = _store().get(job_id)
    if not job or job["user_id"] != user["id"]:
        return jsonify(success=False, error="Try-on job not found."), 404
    return jsonify(success=True, job=_public_job(job))


@tryon_bp.post("/api/tryon/<job_id>/retry")
@require_auth
@upload_limits("tryon_retry")
def retry_tryon(job_id: str):
    user = require_user()
    job = _store().get(job_id)
    if not job or job["user_id"] != user["id"]:
        return jsonify(success=False, error="Try-on job not found."), 404
    if job["status"] != "failed":
        return (
            jsonify(success=False, error="Only failed jobs can be retried."),
            409,
        )

    # Clear previous failure state before re-queueing.
    _store().update(job_id, status="queued", error=None)
    logger.info("Try-on job %s retried by user %s", job_id, user["id"])
    return jsonify(success=True, job=_public_job(_store().get(job_id)))


@tryon_bp.delete("/api/tryon/<job_id>")
@require_auth
@default_limits("tryon_delete")
def delete_tryon(job_id: str):
    user = require_user()
    job = _store().get(job_id)
    if not job or job["user_id"] != user["id"]:
        return jsonify(success=False, error="Try-on job not found."), 404

    if job.get("result_url"):
        storage_service.delete_objects([job["result_url"]])
    _store().delete(job_id)
    logger.info("Try-on job %s deleted for user %s", job_id, user["id"])
    return jsonify(success=True)


# --------------------------------------------------------------------------
def _owns_body_photo(user_id: str, body_photo_id: str) -> bool:
    rows = (
        get_supabase()
        .table("body_photos")
        .select("id")
        .eq("id", body_photo_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
    )
    return bool(rows)


def _validate_clothing_ids(user_id: str, clothing_ids: List[str]) -> List[str]:
    """Return the subset of ids that do NOT exist / do not belong to the user."""
    found = set()
    if clothing_ids:
        catalog = (
            get_supabase()
            .table("clothing")
            .select("id")
            .in_("id", clothing_ids)
            .execute()
            .data
        )
        found.update(str(r["id"]) for r in catalog)
        items = (
            get_supabase()
            .table("clothing_items")
            .select("id")
            .in_("id", clothing_ids)
            .eq("user_id", user_id)
            .execute()
            .data
        )
        found.update(str(r["id"]) for r in items)
    return [cid for cid in clothing_ids if cid not in found]