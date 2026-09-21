"""Segmentation routes.

POST /api/segment                  → instance-mask every object in an image
GET  /api/segment/annotated/<f>    → serve a previously generated annotated image
"""
from __future__ import annotations

import logging
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_from_directory

from services import image_service
from services.segmentation_service import get_segmentation_service

logger = logging.getLogger(__name__)

segmentation_bp = Blueprint("segmentation", __name__)


@segmentation_bp.post("/api/segment")
def segment():
    """Accept a multipart/form-data upload (`image=<file>`) and run instance
    segmentation.

    Optional query param: ?annotated=true → also generate & return an
    annotated (masked) image URL.
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
            jsonify(
                success=False,
                error="No image part in request. Use FormData key 'image'.",
            ),
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
        result = get_segmentation_service().segment(
            image_path=saved_path,
            save_annotated=save_annotated,
            output_dir=current_app.config["OUTPUT_FOLDER"],
        )
    finally:
        # Always delete the temporary upload now that inference has consumed it.
        image_service.cleanup(saved_path)

    if not result.success:
        logger.error("Segmentation failed: %s", result.error)
        return jsonify(success=False, error=result.error), 500

    logger.info(
        "Segmented %d instance(s) in %.1f ms (model=%s)",
        len(result.detections),
        result.elapsed_ms or 0,
        result.model_name,
    )
    return jsonify(result.to_dict()), 200


@segmentation_bp.get("/api/segment/annotated/<path:filename>")
def segment_annotated_image(filename: str):
    """Serve annotated segmentation images (development convenience)."""
    outputs_dir = Path(current_app.config["OUTPUT_FOLDER"])
    return send_from_directory(outputs_dir, filename, as_attachment=False)