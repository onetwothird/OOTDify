"""User routes: profile, body photos, privacy summary, export & account deletion.

Every endpoint here:
  * REQUIRES authentication (Bearer JWT validated server-side).
  * Derives the user id from the validated token — never from the request body.
  * Scopes every query to that user id (defense in depth on top of RLS).
  * Rate-limited.

Account deletion actually performs the deletion end-to-end:
  storage objects → DB rows → Supabase Auth user.
"""
from __future__ import annotations

import io
import json
import logging
from typing import Dict, List, Optional

from flask import Blueprint, jsonify, request, send_file

from config import Config
from services import image_service, storage_service
from services.auth_service import require_auth, require_user
from services.body_analysis import analyze_body_image
from services.ratelimit import default_limits, rate_limit, upload_limits
from services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

users_bp = Blueprint("users", __name__)

_PROFILE_FIELDS = (
    "display_name",
    "avatar_url",
    "preferred_styles",
    "preferred_colors",
    "sizes",
    "preferred_categories",
    "preferred_occasions",
)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def get_profile(user_id: str) -> Optional[dict]:
    rows = (
        get_supabase()
        .table("user_profiles")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def ensure_profile(user_id: str) -> dict:
    """Return the profile row, creating a privacy-minimal default row if absent."""
    existing = get_profile(user_id)
    if existing:
        return existing
    row = (
        get_supabase()
        .table("user_profiles")
        .insert({"user_id": user_id})
        .execute()
        .data
    )
    return row[0] if row else get_profile(user_id) or {}


def _owner_body_photo(photo_id: str, user_id: str) -> Optional[dict]:
    rows = (
        get_supabase()
        .table("body_photos")
        .select("*")
        .eq("id", photo_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def _count(table: str, user_id: str) -> int:
    resp = get_supabase().table(table).select("id", count="exact").eq("user_id", user_id).execute()
    return resp.count if resp.count is not None else len(resp.data)


# --------------------------------------------------------------------------
# Profile
# --------------------------------------------------------------------------
@users_bp.get("/api/profile")
@require_auth
@default_limits("profile_read")
def get_profile_route():
    user = require_user()
    profile = ensure_profile(user["id"])
    return jsonify(
        success=True,
        profile=profile,
        email=user.get("email"),
    )


@users_bp.patch("/api/profile")
@require_auth
@default_limits("profile_update")
def update_profile_route():
    user = require_user()
    payload = request.get_json(silent=True) or {}
    allowed = {k: v for k, v in payload.items() if k in _PROFILE_FIELDS}

    if not allowed:
        return jsonify(success=False, error="No valid profile fields provided."), 400

    # Ensure a row exists, then update it.
    ensure_profile(user["id"])
    rows = (
        get_supabase()
        .table("user_profiles")
        .update({**allowed, "updated_at": "now()"})
        .eq("user_id", user["id"])
        .execute()
        .data
    )
    logger.info("Profile updated for user %s (%s)", user["id"], ", ".join(allowed))
    return jsonify(success=True, profile=rows[0] if rows else get_profile(user["id"]))


# --------------------------------------------------------------------------
# Body photos
# --------------------------------------------------------------------------
@users_bp.post("/api/body-photos")
@require_auth
@upload_limits("body_photo_upload")
def create_body_photo():
    """Validate + analyze + store a user's body photo.

    Privacy flow:
      1. Multipart upload → validated (extension, magic bytes, size).
      2. Saved to a temporary local file (never user-controlled filename).
      3. Real YOLO detection + pose + segmentation run on the temp file.
      4. Original photo uploaded to the PRIVATE `users` bucket
         (users/<uid>/<uuid>.jpg).
      5. Analysis summary stored on the body_photos row.
      6. Temp file deleted (finally) — nothing intermediate is retained.
    """
    user = require_user()

    if "image" not in request.files:
        return jsonify(success=False, error="No image part in request."), 400

    temp_path = None
    try:
        temp_path = image_service.ingest_upload(
            request.files["image"],
            Config.UPLOAD_FOLDER,
            max_bytes=Config.MAX_CONTENT_LENGTH,
        )
        analysis = analyze_body_image(str(temp_path))

        storage_path = storage_service.upload_file(
            "users", user["id"], temp_path, content_type="image/jpeg"
        )
        row = (
            get_supabase()
            .table("body_photos")
            .insert(
                {
                    "user_id": user["id"],
                    "storage_path": storage_path,
                    "detection": {
                        "personDetected": analysis["personDetected"],
                        "personConfidence": analysis["personConfidence"],
                        "detections": analysis["detections"],
                    },
                    "pose": analysis["pose"],
                    "segmentation": analysis["segmentation"],
                }
            )
            .execute()
            .data
        )[0]

        logger.info(
            "Body photo saved for user %s -> %s (person=%s)",
            user["id"],
            storage_path,
            analysis["personDetected"],
        )
        return jsonify(
            success=True,
            body_photo=row,
            analysis=analysis,
            signedUrl=storage_service.signed_url(storage_path, Config.SIGNED_URL_EXPIRY_SECONDS),
        )
    except ValueError as exc:
        return jsonify(success=False, error=str(exc)), 400
    except Exception as exc:
        logger.exception("Body photo upload failed")
        return jsonify(success=False, error=f"Could not process body photo: {exc}"), 500
    finally:
        if temp_path is not None:
            image_service.cleanup(temp_path)


@users_bp.get("/api/body-photos")
@require_auth
@default_limits("body_photos_read")
def list_body_photos():
    user = require_user()
    rows = (
        get_supabase()
        .table("body_photos")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .limit(50)
        .execute()
        .data
    )
    return jsonify(
        success=True,
        body_photos=[
            {
                **row,
                "signedUrl": storage_service.signed_url(
                    row["storage_path"], Config.SIGNED_URL_EXPIRY_SECONDS
                ),
            }
            for row in rows
        ],
    )


@users_bp.delete("/api/body-photos/<photo_id>")
@require_auth
@default_limits("body_photos_delete")
def delete_body_photo(photo_id: str):
    user = require_user()
    photo = _owner_body_photo(photo_id, user["id"])
    if not photo:
        return jsonify(success=False, error="Body photo not found."), 404

    storage_service.delete_objects([photo["storage_path"]])
    get_supabase().table("body_photos").delete().eq("id", photo_id).eq("user_id", user["id"]).execute()
    logger.info("Body photo %s deleted for user %s", photo_id, user["id"])
    return jsonify(success=True)


# --------------------------------------------------------------------------
# Privacy dashboard & data control
# --------------------------------------------------------------------------
@users_bp.get("/api/privacy/summary")
@require_auth
@default_limits("privacy_summary")
def privacy_summary():
    user = require_user()
    try:
        summary = {
            "bodyPhotos": _count("body_photos", user["id"]),
            "wardrobeItems": _count("clothing_items", user["id"]),
            "tryOnJobs": _count("try_on_jobs", user["id"]),
            "savedOutfits": _count("saved_outfits", user["id"]),
            "favorites": _count("favorites", user["id"]),
            "recentlyViewed": _count("recently_viewed", user["id"]),
        }
    except Exception as exc:
        logger.exception("Privacy summary failed")
        return jsonify(success=False, error=f"Could not load data summary: {exc}"), 500
    return jsonify(success=True, summary=summary)


@users_bp.post("/api/account/export")
@require_auth
@default_limits("account_export")
def export_account():
    """Download My Data — a JSON dump of everything the user owns.

    Media files (photos) are referenced by id + storage path; raw pixels are
    NOT embedded (keeps the export small and the signed URLs expiring).
    """
    user = require_user()
    uid = user["id"]

    def rows(table: str, pick: List[str]) -> List[dict]:
        return get_supabase().table(table).select(",".join(pick)).eq("user_id", uid).execute().data

    try:
        payload = {
            "exportedAt": _utc_now(),
            "account": {"email": user.get("email")},
            "profile": get_profile(uid),
            "bodyPhotos": rows("body_photos", ["id", "storage_path", "detection", "created_at"]),
            "wardrobe": rows("clothing_items", ["id", "name", "category", "color", "style", "tags", "created_at"]),
            "favorites": rows("favorites", ["id", "target_type", "target_id", "created_at"]),
            "recentlyViewed": rows("recently_viewed", ["clothing_id", "viewed_at"]),
            "savedOutfits": rows("saved_outfits", ["id", "name", "occasion", "clothing_ids", "created_at"]),
            "tryOnJobs": rows("try_on_jobs", ["id", "status", "clothing_ids", "created_at", "updated_at"]),
        }
    except Exception as exc:
        logger.exception("Export failed")
        return jsonify(success=False, error=f"Could not build export: {exc}"), 500

    data = json.dumps(payload, indent=2, default=str).encode("utf-8")
    return send_file(
        io.BytesIO(data),
        mimetype="application/json",
        as_attachment=True,
        download_name=f"ootdify-export-{uid[:8]}.json",
    )


@users_bp.delete("/api/account")
@require_auth
@rate_limit(Config.RATE_LIMIT_ACCOUNT_MAX, Config.RATE_LIMIT_ACCOUNT_WINDOW, "account_delete")
def delete_account():
    """Permanently delete the account and ALL of the user's data.

    Order matters (so nothing orphaned survives):
      1. Private storage objects (body photos, wardrobe, try-ons, avatar).
      2. DB rows across every user-owned table.
      3. The Supabase Auth user (cascades anything remaining).
    """
    user = require_user()
    uid = user["id"]
    try:
        # 1. Storage
        storage_service.delete_user_storage(uid)

        # 2. Rows (best-effort explicit; cascades cover the rest)
        for table in (
            "body_photos",
            "clothing_items",
            "favorites",
            "recently_viewed",
            "saved_outfits",
            "try_on_jobs",
            "user_profiles",
        ):
            get_supabase().table(table).delete().eq("user_id", uid).execute()

        # 3. Auth account
        get_supabase().auth.admin.delete_user(uid)
    except Exception as exc:
        logger.exception("Account deletion failed for %s", uid)
        return jsonify(success=False, error=f"Account deletion failed: {exc}"), 500

    logger.warning("Account deleted: %s", uid)
    return jsonify(success=True, message="Account and all associated data deleted.")


def _utc_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()