"""Pose estimation routes.

POST /api/pose                  → estimate a body skeleton for each person
GET  /api/pose/annotated/<f>    → serve a previously generated annotated image
"""
from __future__ import annotations

import logging
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_from_directory

from services import image_service
from services.pose_service import get_pose_service

logger = logging.getLogger(__name__)

pose_bp = Blueprint("pose", __name__)


@pose_bp.post("/api/pose")
def pose():
    """Accept a multipart/form-data upload (`image=<file>`) and estimate poses.

    Optional query param: ?annotated=true → also generate & return an
    annotated skeleton image URL.
    """
    save_annotated = request.args.get("annotated", "false").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }

    # ------------------------------------------------------------ validation
    if "image" not in request.files:
        return (
            jsonify(success=False, error="No image part in request. Use FormData key 'image'."),
            400,
        )

    try:
        saved_path = image_service.ingest_upload(
            request.files["image"],
            current_app.config["UPLOAD_FOLDER"],
            max_bytes=current_app.config["MAX_CONTENT_LENGTH"],
        )
    except ValueError as exc:
        return jsonify(success=False, error=str(exc)), 400
    except Exception as exc:
        logger.exception("Failed to store upload")
        return jsonify(success=False, error="Could not store upload."), 500

    # --------------------------------------------------------------- inference
    try:
        result = get_pose_service().estimate(
            image_path=saved_path,
            save_annotated=save_annotated,
            output_dir=current_app.config["OUTPUT_FOLDER"],
        )
    finally:
        # Always delete the temporary upload now that inference has consumed it.
        image_service.cleanup(saved_path)

    if not result.success:
        logger.error("Pose estimation failed: %s", result.error)
        return jsonify(success=False, error=result.error), 500

    logger.info(
        "Estimated %d pose(s) in %.1f ms (model=%s)",
        len(result.poses),
        result.elapsed_ms or 0,
        result.model_name,
    )
    return jsonify(result.to_dict()), 200


@pose_bp.get("/api/pose/annotated/<path:filename>")
def pose_annotated_image(filename: str):
    """Serve annotated pose images (development convenience)."""
    outputs_dir = Path(current_app.config["OUTPUT_FOLDER"])
    return send_from_directory(outputs_dir, filename, as_attachment=False)