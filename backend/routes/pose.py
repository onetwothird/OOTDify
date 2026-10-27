"""Pose estimation routes.

POST /api/pose                  → estimate a body skeleton for each person
POST /api/tryon/live/pose       → live try-on preview: normalized keypoints only
GET  /api/pose/annotated/<f>    → serve a previously generated annotated image
"""
from __future__ import annotations

import logging
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from PIL import Image

from config import Config
from services import image_service
from services.auth_service import require_auth
from services.consent import require_consent
from services.pose_service import get_pose_service, largest_pose, normalize_keypoints
from services.ratelimit import live_limits, upload_limits

logger = logging.getLogger(__name__)

pose_bp = Blueprint("pose", __name__)


@pose_bp.post("/api/pose")
@require_auth
@upload_limits("pose_upload")
@require_consent
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


@pose_bp.post("/api/tryon/live/pose")
@require_auth
@live_limits("live_pose")
@require_consent
def live_pose():
    """Live try-on preview: one camera snapshot (`image=<file>`) → keypoints.

    Stateless: the snapshot is deleted right after inference and only the
    nearest person's keypoints come back, normalized to 0..1 of the image so
    the app can map them onto its camera preview. Called about twice a
    second, so it has its own per-minute limit and logs at debug level.
    """
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
    except Exception:
        logger.exception("Failed to store live snapshot")
        return jsonify(success=False, error="Could not store upload."), 500

    try:
        with Image.open(saved_path) as img:
            width, height = img.size
        result = get_pose_service().estimate(
            image_path=saved_path,
            save_annotated=False,
            output_dir=None,
            image_size=Config.LIVE_POSE_IMAGE_SIZE,
        )
    finally:
        image_service.cleanup(saved_path)

    if not result.success:
        logger.error("Live pose estimation failed: %s", result.error)
        return jsonify(success=False, error=result.error), 500

    person = largest_pose(result.poses)
    keypoints = normalize_keypoints(person.keypoints, width, height) if person else []
    logger.debug("Live pose: %d keypoint(s) in %.1f ms", len(keypoints), result.elapsed_ms or 0)
    return (
        jsonify(
            success=True,
            personDetected=bool(keypoints),
            keypoints=keypoints,
            imageWidth=width,
            imageHeight=height,
            inference_ms=result.elapsed_ms,
        ),
        200,
    )


@pose_bp.get("/api/pose/annotated/<path:filename>")
@require_auth
def pose_annotated_image(filename: str):
    """Serve annotated pose images (development convenience)."""
    outputs_dir = Path(current_app.config["OUTPUT_FOLDER"])
    return send_from_directory(outputs_dir, filename, as_attachment=False)