"""
Community routes that need the service role.

POST /api/community/rooms/<room_id>/icon → host a room's icon on Cloudinary

Everything else in Community (posts, rooms, messages) goes from the app to
Supabase directly under RLS. A room photo cannot: the Cloudinary secret lives
only here, and a database trigger (migration 20261028130000) rejects any
icon_url that does not come from the service role, so a client can never point
a room at an arbitrary URL.
"""
from __future__ import annotations

import logging
import uuid

from flask import Blueprint, jsonify, request

from config import Config
from services import cloudinary_service, image_service
from services.auth_service import require_auth, require_user
from services.ratelimit import upload_limits
from services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

community_bp = Blueprint("community", __name__)


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


@community_bp.post("/api/community/rooms/<room_id>/icon")
@require_auth
@upload_limits("room_icon")
def upload_room_icon_route(room_id: str):
    """Host a new room icon on Cloudinary and save it; only the room's creator may."""
    user = require_user()
    if not _is_uuid(room_id):
        return jsonify(success=False, error="Room not found."), 404
    if "image" not in request.files:
        return jsonify(success=False, error="No image part in request."), 400

    db = get_supabase()
    rows = db.table("conversations").select("id, created_by").eq("id", room_id).limit(1).execute().data
    if not rows:
        return jsonify(success=False, error="Room not found."), 404
    if rows[0].get("created_by") != user["id"]:
        return jsonify(success=False, error="Only the room's creator can change its icon."), 403

    temp_path = None
    try:
        temp_path = image_service.ingest_upload(
            request.files["image"],
            Config.UPLOAD_FOLDER,
            max_bytes=Config.MAX_CONTENT_LENGTH,
        )
        url = cloudinary_service.upload_room_icon(user["id"], temp_path)
    except ValueError as exc:
        return jsonify(success=False, error=str(exc)), 400
    except cloudinary_service.CloudinaryNotConfiguredError:
        logger.error("Room icon upload attempted but Cloudinary is not configured")
        return jsonify(success=False, error="Room photos are not available right now."), 503
    except cloudinary_service.CloudinaryError:
        logger.exception("Room icon upload rejected by Cloudinary")
        return jsonify(success=False, error="Cloudinary did not accept the photo. Please try again later."), 502
    except Exception:
        logger.exception("Room icon upload failed")
        return jsonify(success=False, error="Could not upload the room photo. Please try again."), 500
    finally:
        if temp_path is not None:
            image_service.cleanup(temp_path)

    try:
        # A photo replaces any preset icon.
        saved = (
            db.table("conversations")
            .update({"icon_url": url, "icon_preset": None})
            .eq("id", room_id)
            .execute()
            .data
        )
    except Exception:
        logger.exception("Room icon uploaded but saving it failed")
        return jsonify(success=False, error="The photo uploaded but could not be saved to the room."), 500
    row = saved[0] if saved else {"id": room_id, "icon_url": url, "icon_preset": None}
    return jsonify(
        success=True,
        room={"id": row["id"], "icon_url": row.get("icon_url"), "icon_preset": row.get("icon_preset")},
    )
