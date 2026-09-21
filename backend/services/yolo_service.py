"""YOLO service.

Responsibility: load a single Ultralytics YOLO model once per process and run
inference on image files. Returns plain, JSON-serialisable data structures.

The model is created lazily but *cached forever* after the first call, so it is
NOT re-loaded on every request. Inference is guarded with a threading.Lock
because YOLO inference is not guaranteed thread-safe under Flask's default
threaded server.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from PIL import Image as PILImage
from ultralytics import YOLO

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------
# Result data structures
# --------------------------------------------------------------------------
@dataclass
class Detection:
    """One detected object."""

    class_name: str
    confidence: float
    bbox: Dict[str, int]  # {"x1", "y1", "x2", "y2"} absolute pixels

    def to_dict(self) -> dict:
        return {
            "class": self.class_name,
            "confidence": round(self.confidence, 4),
            "bbox": self.bbox,
        }


@dataclass
class DetectionResult:
    """Everything the API needs to return about one image."""

    success: bool
    detections: List[dict] = field(default_factory=list)
    annotated_filename: Optional[str] = None  # e.g. "abc123_annotated.jpg"
    elapsed_ms: Optional[float] = None
    model_name: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "detections": self.detections,
            "annotated_image_url": (
                f"/api/detect/annotated/{self.annotated_filename}"
                if self.annotated_filename
                else None
            ),
            "inference_ms": self.elapsed_ms,
            "model": self.model_name,
            "error": self.error,
        }


# --------------------------------------------------------------------------
# YOLO service
# --------------------------------------------------------------------------
class YOLOService:
    def __init__(
        self,
        model_path: str,
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        image_size: int = 640,
        device: str = "cpu",
    ) -> None:
        self.model_path = str(model_path)
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.image_size = image_size
        self.device = device
        self._model: Optional[YOLO] = None
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ load
    def load(self) -> YOLO:
        """Load (or download) the weights exactly once. Idempotent."""
        with self._lock:
            if self._model is not None:
                return self._model
            logger.info("Loading YOLO model from %s ...", self.model_path)
            started = time.perf_counter()
            # If the .pt file does not exist yet, Ultralytics downloads it to
            # self.model_path on first load.
            self._model = YOLO(self.model_path)
            logger.info(
                "Model ready in %.2fs (device=%s, weights=%s)",
                time.perf_counter() - started,
                self.device,
                self.model_path,
            )
            return self._model

    @property
    def model(self) -> YOLO:
        return self._model if self._model is not None else self.load()

    @property
    def model_name(self) -> str:
        return Path(self.model_path).stem

    # -------------------------------------------------------------- inference
    def detect(
        self,
        image_path: str | Path,
        save_annotated: bool = False,
        output_dir: Optional[str | Path] = None,
    ) -> DetectionResult:
        """Run YOLO on one image file and return structured detections.

        Args:
            image_path: absolute or relative path to an existing image file.
            save_annotated: when True, also saves a copy of the image with
                bounding boxes drawn into `output_dir`.
            output_dir: folder for the annotated image (required if
                save_annotated is True).

        Returns:
            DetectionResult — never raises; errors are captured in .error.
        """
        model = self.model
        started = time.perf_counter()

        try:
            results = model.predict(
                source=str(image_path),
                conf=self.conf_threshold,
                iou=self.iou_threshold,
                imgsz=self.image_size,
                device=self.device,
                verbose=False,  # keep the console clean
            )
        except Exception as exc:  # inference failure (bad file, OOM, etc.)
            logger.exception("YOLO inference failed")
            return DetectionResult(
                success=False,
                error=f"YOLO inference failed: {exc}",
            )

        elapsed_ms = (time.perf_counter() - started) * 1000.0

        # --- Extract classes / confidences / boxes -------------------------
        detections: List[dict] = []
        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue
            names = result.names
            for box in boxes:
                cls_id = int(box.cls.item())
                conf = float(box.conf.item())
                x1, y1, x2, y2 = (round(v) for v in box.xyxy[0].cpu().tolist())
                detections.append(
                    Detection(
                        class_name=names.get(cls_id, str(cls_id)),
                        confidence=round(conf, 4),
                        bbox={"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                    ).to_dict()
                )

        # --- Optional annotated image --------------------------------------
        annotated_filename: Optional[str] = None
        if save_annotated:
            try:
                annotated_filename = self._save_annotated(
                    results, image_path, output_dir
                )
            except Exception as exc:
                logger.warning("Could not save annotated image: %s", exc)

        return DetectionResult(
            success=True,
            detections=detections,
            annotated_filename=annotated_filename,
            elapsed_ms=round(elapsed_ms, 1),
            model_name=self.model_name,
        )

    # ---------------------------------------------------------------- helpers
    @staticmethod
    def _save_annotated(
        results, image_path: str | Path, output_dir: str | Path | None
    ) -> str:
        """Save results[0].plot() (BGR numpy) as a JPEG next to business outputs."""
        if not output_dir:
            raise ValueError("output_dir is required when save_annotated=True")

        out_dir = Path(output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        bgr_array = results[0].plot()  # annotated image, BGR channel order
        filename = f"{Path(image_path).stem}_annotated.jpg"
        target = out_dir / filename

        # Convert BGR -> RGB and save with Pillow
        rgb_array = bgr_array[..., ::-1]
        PILImage.fromarray(rgb_array).save(target, quality=90)
        logger.info("Saved annotated image: %s", target)
        return filename


# --------------------------------------------------------------------------
# Lazy process-wide singleton (wired to Flask config in app.py)
# --------------------------------------------------------------------------
_settings: Optional[dict] = None
_service: Optional[YOLOService] = None
_build_lock = threading.Lock()


def configure(model_path: str, **kwargs) -> None:
    """Store the settings used later to build the singleton service."""
    global _settings
    _settings = {"model_path": model_path, **kwargs}


def get_yolo_service() -> YOLOService:
    """Return the cached service, building it once on first call.

    This is what avoid loading the model on every request: after the first
    call (which happens at app startup when MODEL_LOAD_ON_STARTUP=1) the
    YOLOService instance—and therefore the loaded weights—live in _service
    for the lifetime of the process.
    """
    global _service
    if _service is None:
        with _build_lock:
            if _service is None:
                if _settings is None:
                    raise RuntimeError(
                        "yolo_service.configure() must be called before first use"
                    )
                _service = YOLOService(**_settings)
                _service.load()  # warm up now; later requests reuse it
    return _service


def is_model_loaded() -> bool:
    return _service is not None and _service._model is not None