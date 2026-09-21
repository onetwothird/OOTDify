"""Central configuration for the OOTDify Flask backend.

Every value here can be overridden with environment variables (see .env.example).
Environment variables are loaded from backend/.env by python-dotenv.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# --- Load backend/.env if it exists (never commit real secrets) ---
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env")


class Config:
    # ----------------------------- Flask core -----------------------------
    DEBUG = os.getenv("FLASK_DEBUG", "1").lower() in {"1", "true", "yes", "on"}
    HOST = os.getenv("FLASK_HOST", "0.0.0.0")
    PORT = int(os.getenv("FLASK_PORT", "5000"))
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me")

    # Max upload size: 10 MB (raise a 413 if exceeded)
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", str(10 * 1024 * 1024)))

    # Which file extensions the API will accept
    ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}

    # Comma-separated list of origins allowed by CORS. "*" is fine for local
    # development; restrict it (e.g. https://app.ootdify.com) in production.
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

    # ----------------------------- File storage ---------------------------
    UPLOAD_FOLDER = Path(os.getenv("UPLOAD_FOLDER", str(BASE_DIR / "uploads")))
    OUTPUT_FOLDER = Path(os.getenv("OUTPUT_FOLDER", str(BASE_DIR / "outputs")))

    # ------------------------------- YOLO ---------------------------------
    # Path to the model weights. If the file does not exist, Ultralytics
    # downloads it automatically to this location on first load.
    YOLO_MODEL_PATH = os.getenv(
        "YOLO_MODEL_PATH",
        str(BASE_DIR / "models" / "yolo" / "yolo11n.pt"),
    )

    # Confidence threshold (0..1): ignore detections below this score
    YOLO_CONF_THRESHOLD = float(os.getenv("YOLO_CONF_THRESHOLD", "0.25"))
    # IoU threshold used for non-maximum suppression
    YOLO_IOU = float(os.getenv("YOLO_IOU", "0.45"))
    # Inference image size (height & width). 640 = fast, 1280 = more accurate
    YOLO_IMAGE_SIZE = int(os.getenv("YOLO_IMAGE_SIZE", "640"))
    # "cpu", "cuda", "mps" or "auto" (auto picks the best available device)
    YOLO_DEVICE = os.getenv("YOLO_DEVICE", "cpu")

    # Load the model at startup (recommended) instead of lazily on first request
    MODEL_LOAD_ON_STARTUP = os.getenv("MODEL_LOAD_ON_STARTUP", "1").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }

    # ------------------------------- Pose ---------------------------------
    # yolov8n-pose.pt is downloaded automatically on first load (like yolo11n.pt).
    POSE_MODEL_PATH = os.getenv(
        "POSE_MODEL_PATH",
        str(BASE_DIR / "models" / "yolo" / "yolov8n-pose.pt"),
    )
    POSE_CONF_THRESHOLD = float(os.getenv("POSE_CONF_THRESHOLD", "0.25"))
    POSE_IOU = float(os.getenv("POSE_IOU", "0.45"))
    POSE_IMAGE_SIZE = int(os.getenv("POSE_IMAGE_SIZE", "640"))
    POSE_DEVICE = os.getenv("POSE_DEVICE", "cpu")

    # ---------------------------- Segmentation -----------------------------
    # yolov8n-seg.pt is downloaded automatically on first load.
    SEG_MODEL_PATH = os.getenv(
        "SEG_MODEL_PATH",
        str(BASE_DIR / "models" / "yolo" / "yolov8n-seg.pt"),
    )
    SEG_CONF_THRESHOLD = float(os.getenv("SEG_CONF_THRESHOLD", "0.25"))
    SEG_IOU = float(os.getenv("SEG_IOU", "0.45"))
    SEG_IMAGE_SIZE = int(os.getenv("SEG_IMAGE_SIZE", "640"))
    SEG_DEVICE = os.getenv("SEG_DEVICE", "cpu")

    # ------------------------------- Try-on -------------------------------
    # Folder where try-on job records are persisted (JSON, no DB needed).
    TRYON_DATA_FOLDER = Path(os.getenv("TRYON_DATA_FOLDER", str(BASE_DIR / "data")))
    # When a real virtual-try-on model is available, point this at its weights
    # and implement `tryon_service.run_pipeline()` (see that file for the
    # integration boundary). Leave empty to keep the honest "not configured"
    # behaviour.
    TRYON_MODEL_PATH = os.getenv("TRYON_MODEL_PATH", "")

    # Seconds between worker polls for queued try-on jobs (local dev value;
    # in production prefer a proper queue such as Redis/Celery or Postgres LISTEN).
    TRYON_POLL_INTERVAL = float(os.getenv("TRYON_POLL_INTERVAL", "5.0"))
    # Run the background try-on worker inside this Flask process.
    TRYON_WORKER_ENABLED = os.getenv("TRYON_WORKER_ENABLED", "1").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }

    # ------------------------------ Supabase -------------------------------
    # Backend-only credentials. NEVER expose these to the Expo app — the app
    # uses the public (anon/publishable) key from src/shared/config/api.ts.
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    # How long signed URLs for private objects stay valid (seconds).
    SIGNED_URL_EXPIRY_SECONDS = int(os.getenv("SIGNED_URL_EXPIRY_SECONDS", "900"))

    # Object path prefixes per bucket; mirrors supabase/schema.sql.
    BUCKETS = {
        "users": "users",
        "wardrobe": "wardrobe",
        "clothing": "clothing",
        "tryons": "tryons",
        "avatars": "avatars",
    }
    # Buckets that hold user-owned private objects (deleted on account deletion).
    PRIVATE_BUCKETS = ("users", "wardrobe", "tryons", "avatars")

    # ----------------------------- Rate limiting ---------------------------
    # Simple in-memory limits (per authenticated user, per rule name).
    RATE_LIMIT_DEFAULT_MAX = int(os.getenv("RATE_LIMIT_DEFAULT_MAX", "120"))
    RATE_LIMIT_DEFAULT_WINDOW = int(os.getenv("RATE_LIMIT_DEFAULT_WINDOW", "60"))
    RATE_LIMIT_UPLOAD_MAX = int(os.getenv("RATE_LIMIT_UPLOAD_MAX", "15"))
    RATE_LIMIT_UPLOAD_WINDOW = int(os.getenv("RATE_LIMIT_UPLOAD_WINDOW", "3600"))
    RATE_LIMIT_ACCOUNT_MAX = int(os.getenv("RATE_LIMIT_ACCOUNT_MAX", "10"))
    RATE_LIMIT_ACCOUNT_WINDOW = int(os.getenv("RATE_LIMIT_ACCOUNT_WINDOW", "3600"))

    # ------------------------------ Helpers -------------------------------
    @classmethod
    def ensure_dirs(cls) -> None:
        """Create uploads/outputs/model folders if they do not exist yet."""
        for folder in (
            cls.UPLOAD_FOLDER,
            cls.OUTPUT_FOLDER,
            Path(cls.YOLO_MODEL_PATH).parent,
            Path(cls.POSE_MODEL_PATH).parent,
            Path(cls.SEG_MODEL_PATH).parent,
            cls.TRYON_DATA_FOLDER / "jobs",
        ):
            folder.mkdir(parents=True, exist_ok=True)