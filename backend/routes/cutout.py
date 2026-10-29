"""Cut-out route.

GET /api/clothing/<item_id>/cutout → the garment alone, as a transparent PNG.

The item must be in the shared catalog or the caller's own closet; anything
else is a 404. The image is read server-side by id and processed in a temp
file that is always deleted. Nothing is stored.
"""
from __future__ import annotations

import base64
import logging
import uuid

from flask import Blueprint, g, jsonify

from config import Config
from services import image_service, tryon_service
from services.auth_service import require_auth
from services.consent import require_consent
from services.garment_isolation import isolate_garment
from services.ratelimit import upload_limits

logger = logging.getLogger(__name__)

cutout_bp = Blueprint("cutout", __name__)


@cutout_bp.get("/api/clothing/<item_id>/cutout")
@require_auth
@upload_limits("cutout")
@require_consent
def clothing_cutout(item_id: str):
    try:
        uuid.UUID(item_id)
    except ValueError:
        # The id columns are uuid; anything else cannot exist.
        return jsonify(success=False, error="Clothing item not found."), 404

    temp_path = None
    try:
        item = tryon_service.resolve_clothing_item(g.current_user["id"], item_id)
        if item is None:
            return jsonify(success=False, error="Clothing item not found."), 404

        data = tryon_service._resolve_image_bytes(item["image_url"])
        temp_path = Config.UPLOAD_FOLDER / f"cutout_{uuid.uuid4().hex}.img"
        temp_path.write_bytes(data)
        result = isolate_garment(temp_path, transparent=True)
    except Exception:
        logger.exception("Cut-out failed for item %s", item_id)
        return jsonify(success=False, error="Could not create the cut-out."), 500
    finally:
        if temp_path is not None:
            image_service.cleanup(temp_path)

    ok = bool(result.ok and result.png)
    return jsonify(
        success=True,
        cutout={
            "ok": ok,
            "reason": None if ok else (result.reason or "processing_failed"),
            "png_base64": base64.b64encode(result.png).decode("ascii") if ok else None,
            "width": result.width if ok else None,
            "height": result.height if ok else None,
        },
    )
