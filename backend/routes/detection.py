"""Detection routes.

POST /api/detect                → run YOLO on an uploaded image
POST /api/analyze               → run YOLO (+pose/+seg for kind=body) — no persistence
GET  /api/detect/annotated/<f>  → serve a previously generated annotated image
GET  /health                    → liveness probe

PRIVACY: /api/detect and /api/analyze only touch *temporary* files — the
upload is deleted as soon as inference finishes (finally block) and nothing
is written to storage or the database.
"""
from __future__ import annotations

import logging
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_from_directory

from config import Config
from services import image_service
from services.auth_service import require_auth
from services.body_analysis import analyze_body_image
from services.ratelimit import upload_limits
from services.yolo_service import get_yolo_service, is_model_loaded

logger = logging.getLogger(__name__)

detection_bp = Blueprint("detection", __name__)


@detection_bp.get("/health")
def health():
    """Lightweight endpoint the mobile app (or a load balancer) can ping."""
    return jsonify(
        status="ok",
        service="ootdify-ai",
        version="1.0.0",
        model_loaded=is_model_loaded(),
    )


@detection_bp.post("/api/analyze")
@require_auth
@upload_limits("analyze_upload")
def analyze():
    """Analyze an uploaded image without persisting anything.

    kind=body (default): detection + pose + segmentation (used by Scan flow
    to preview a body scan before saving).
    kind=clothing: plain detection only (used for capture feedback).
    """
    kind = (request.form.get("kind") or request.args.get("kind") or "body").lower()
    if kind not in {"body", "clothing"}:
        return jsonify(success=False, error="kind must be 'body' or 'clothing'."), 400

    if "image" not in request.files:
        return jsonify(success=False, error="No image part in request. Use FormData key 'image'."), 400

    temp_path = None
    try:
        temp_path = image_service.ingest_upload(
            request.files["image"],
            Config.UPLOAD_FOLDER,
            max_bytes=Config.MAX_CONTENT_LENGTH,
        )
        if kind == "body":
            result = analyze_body_image(str(temp_path))
        else:
            det = get_yolo_service().detect(image_path=str(temp_path))
            if not det.success:
                return jsonify(success=False, error=det.error), 500
            result = {"personDetected": False, "detections": det.detections}
    except ValueError as exc:
        return jsonify(success=False, error=str(exc)), 400
    except Exception as exc:
        logger.exception("Analyze failed (kind=%s)", kind)
        return jsonify(success=False, error=f"Analysis failed: {exc}"), 500
    finally:
        if temp_path is not None:
            image_service.cleanup(temp_path)

    return jsonify(success=True, kind=kind, analysis=result)


@detection_bp.post("/api/detect")
def detect():
    """Accept a multipart/form-data upload (`image=<file>`) and run YOLO.

    Optional query param: ?annotated=true → also generate & return an
    annotated image URL.
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

    file = request.files["image"]
    if not file or not file.filename:
        return jsonify(success=False, error="Empty filename."), 400

    if not image_service.has_allowed_extension(file.filename):
        return (
            jsonify(
                success=False,
                error="Unsupported file type. Allowed: png, jpg, jpeg, webp.",
            ),
            415,
        )

    # ------------------------------------------------------------ save upload
    uploads_dir = current_app.config["UPLOAD_FOLDER"]
    try:
        saved_path = image_service.save_upload(
            file,
            uploads_dir,
            max_bytes=current_app.config["MAX_CONTENT_LENGTH"],
        )
    except ValueError as exc:
        return jsonify(success=False, error=str(exc)), 400
    except Exception as exc:
        logger.exception("Failed to store upload")
        return jsonify(success=False, error="Could not store upload."), 500

    # Confirm it is actually an image (not a renamed .exe, etc.)
    if not image_service.is_valid_image(saved_path):
        image_service.cleanup(saved_path)
        return jsonify(success=False, error="File is not a valid image."), 400

    # --------------------------------------------------------------- inference
    try:
        result = get_yolo_service().detect(
            image_path=saved_path,
            save_annotated=save_annotated,
            output_dir=current_app.config["OUTPUT_FOLDER"],
        )
    finally:
        # Always delete the temporary upload now that inference has consumed it.
        image_service.cleanup(saved_path)

    if not result.success:
        logger.error("Detection failed: %s", result.error)
        return jsonify(success=False, error=result.error), 500

    logger.info(
        "Detected %d object(s) in %.1f ms (model=%s, annotated=%s)",
        len(result.detections),
        result.elapsed_ms or 0,
        result.model_name,
        save_annotated,
    )
    return jsonify(result.to_dict()), 200


@detection_bp.get("/api/detect/annotated/<path:filename>")
def annotated_image(filename: str):
    """Serve annotated result images (development convenience)."""
    outputs_dir = Path(current_app.config["OUTPUT_FOLDER"])
    return send_from_directory(outputs_dir, filename, as_attachment=False)