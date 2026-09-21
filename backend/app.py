"""Flask application factory for the OOTDify AI backend.

Run locally:
    cd backend
    python app.py

or with the Flask CLI:
    flask --app app run --debug

The app is created through create_app() so tests / future services
(pose, segmentation, try-on) can build their own instances.
"""
from __future__ import annotations

import logging
from logging.config import dictConfig

from flask import Flask, jsonify
from flask_cors import CORS

from config import Config
from routes.detection import detection_bp
from routes.users import users_bp
from routes.pose import pose_bp
from routes.recommend import recommend_bp
from routes.segmentation import segmentation_bp
from routes.tryon import tryon_bp
from services import pose_service, segmentation_service, tryon_service, yolo_service

# --------------------------------------------------------------------------
# Logging (structured, easy to read in the terminal)
# --------------------------------------------------------------------------
dictConfig(
    {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "[%(asctime)s] %(levelname)s %(name)s: %(message)s",
                "datefmt": "%H:%M:%S",
            },
        },
        "handlers": {
            "console": {"class": "logging.StreamHandler", "formatter": "default"},
        },
        "root": {"level": "INFO", "handlers": ["console"]},
    }
)
logger = logging.getLogger(__name__)


def create_app(config_object=Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)

    # Create runtime folders (uploads/, outputs/, models/yolo/)
    Config.ensure_dirs()

    # CORS — needed for Expo Web and any browser-based dev tools.
    # In production, restrict origins via the CORS_ORIGINS environment variable.
    origins = app.config["CORS_ORIGINS"]
    CORS(
        app,
        resources={r"/api/*": {"origins": origins}},
        supports_credentials=True,
    )

    # Register route blueprints
    app.register_blueprint(detection_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(pose_bp)
    app.register_blueprint(recommend_bp)
    app.register_blueprint(tryon_bp)
    app.register_blueprint(segmentation_bp)

    # ----------------------------------------------------------------------
    # AI body-model wiring (detection + pose + segmentation)
    # 1) Tell each service module what settings to use.
    # 2) Warm the models at startup so the first request is not slow, and so a
    #    missing / bad weights file fails fast at boot instead of at runtime.
    # ----------------------------------------------------------------------
    yolo_service.configure(
        model_path=app.config["YOLO_MODEL_PATH"],
        conf_threshold=app.config["YOLO_CONF_THRESHOLD"],
        iou_threshold=app.config["YOLO_IOU"],
        image_size=app.config["YOLO_IMAGE_SIZE"],
        device=app.config["YOLO_DEVICE"],
    )
    pose_service.configure(
        model_path=app.config["POSE_MODEL_PATH"],
        conf_threshold=app.config["POSE_CONF_THRESHOLD"],
        iou_threshold=app.config["POSE_IOU"],
        image_size=app.config["POSE_IMAGE_SIZE"],
        device=app.config["POSE_DEVICE"],
    )
    segmentation_service.configure(
        model_path=app.config["SEG_MODEL_PATH"],
        conf_threshold=app.config["SEG_CONF_THRESHOLD"],
        iou_threshold=app.config["SEG_IOU"],
        image_size=app.config["SEG_IMAGE_SIZE"],
        device=app.config["SEG_DEVICE"],
    )
    tryon_service.configure(
        data_folder=app.config["TRYON_DATA_FOLDER"],
        output_dir=app.config["OUTPUT_FOLDER"],
    )
    tryon_service.start_worker_if_enabled()

    if app.config["MODEL_LOAD_ON_STARTUP"]:
        for name, loader in (
            ("YOLO (detection)", yolo_service.get_yolo_service),
            ("pose", pose_service.get_pose_service),
            ("segmentation", segmentation_service.get_segmentation_service),
        ):
            try:
                loader()
            except Exception as exc:
                logger.critical("Failed to load %s model at startup: %s", name, exc)
                raise

    # ------------------------------------------------------------------ errors
    @app.errorhandler(404)
    def not_found(_e):
        return jsonify(success=False, error="Route not found."), 404

    @app.errorhandler(405)
    def method_not_allowed(_e):
        return jsonify(success=False, error="Method not allowed."), 405

    @app.errorhandler(413)
    def too_large(_e):
        return (
            jsonify(success=False, error="File too large (max 10 MB)."),
            413,
        )

    @app.errorhandler(500)
    def internal_error(_e):
        logger.exception("Unhandled server error")
        return jsonify(success=False, error="Internal server error."), 500

    return app


# Module-level app for `flask --app app run` and for consistency with
# common Flask deployments (gunicorn app:app).
app = create_app()

if __name__ == "__main__":
    app.run(host=Config.HOST, port=Config.PORT, debug=Config.DEBUG)