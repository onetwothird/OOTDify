"""Segmentation service (Ultralytics YOLOv8-seg).

Lazy process-wide singleton (same pattern as yolo_service). yolov8n-seg.pt is
auto-downloaded on first load if missing.

Exposes two entry points:
  * detect(image_path)  → summary used by body analysis / try-on pipeline
  * segment(image_path, save_annotated, output_dir) → instance detections
    + optional annotated preview (served by /api/segment/annotated/<file>).

PRIVACY: mask *images* are not persisted — only summary metadata (and, when
explicitly requested by a route, an annotated preview in outputs/). Temporary
uploads are always cleaned up by the calling route.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from ultralytics import YOLO

from services import image_service

logger = logging.getLogger(__name__)


@dataclass
class SegmentationResult:
    success: bool
    person_detected: bool = False
    mask_count: int = 0
    detections: List[dict] = field(default_factory=list)
    annotated_filename: Optional[str] = None
    elapsed_ms: Optional[float] = None
    model_name: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "personDetected": self.person_detected,
            "maskCount": self.mask_count,
            "detections": self.detections,
            "annotated_image_url": (
                f"/api/segment/annotated/{self.annotated_filename}"
                if self.annotated_filename
                else None
            ),
            "inference_ms": self.elapsed_ms,
            "model": self.model_name,
            "error": self.error,
        }


class SegmentationService:
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
        with self._lock:
            if self._model is not None:
                return self._model
            logger.info("Loading segmentation model from %s ...", self.model_path)
            started = time.perf_counter()
            self._model = YOLO(self.model_path)
            logger.info("Segmentation model ready in %.2fs", time.perf_counter() - started)
            return self._model

    @property
    def model(self) -> YOLO:
        return self._model if self._model is not None else self.load()

    @property
    def model_name(self) -> str:
        return Path(self.model_path).stem

    # -------------------------------------------------------------- inference
    def detect(self, image_path: str | Path) -> SegmentationResult:
        """Summary segmentation run (no annotated preview)."""
        return self.segment(image_path, save_annotated=False, output_dir=None)

    def segment(
        self,
        image_path: str | Path,
        save_annotated: bool = False,
        output_dir: Optional[str | Path] = None,
    ) -> SegmentationResult:
        """Run instance segmentation; returns detections (+ optional preview)."""
        started = time.perf_counter()
        try:
            results = self.model.predict(
                source=str(image_path),
                conf=self.conf_threshold,
                iou=self.iou_threshold,
                imgsz=self.image_size,
                device=self.device,
                verbose=False,
            )
        except Exception as exc:
            logger.exception("Segmentation inference failed")
            return SegmentationResult(success=False, error=f"Segmentation inference failed: {exc}")

        elapsed_ms = (time.perf_counter() - started) * 1000.0
        person_detected = False
        mask_count = 0
        detections: List[dict] = []

        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue
            names = result.names
            for box in boxes:
                cls_id = int(box.cls.item())
                conf = float(box.conf.item())
                class_name = names.get(cls_id, str(cls_id))
                detections.append({"class": class_name, "confidence": round(conf, 4)})
                if class_name == "person":
                    person_detected = True
            if getattr(result, "masks", None) is not None:
                mask_count = max(mask_count, len(result.masks))

        annotated_filename: Optional[str] = None
        if save_annotated and results:
            try:
                annotated_filename = image_service.save_annotated_plot(
                    results,
                    output_dir or Path("."),
                    Path(image_path).stem,
                )
            except Exception as exc:
                logger.warning("Could not save annotated segmentation image: %s", exc)

        return SegmentationResult(
            success=True,
            person_detected=person_detected,
            mask_count=mask_count,
            detections=detections,
            annotated_filename=annotated_filename,
            elapsed_ms=round(elapsed_ms, 1),
            model_name=self.model_name,
        )


# --------------------------------------------------------------------------
# Lazy process-wide singleton
# --------------------------------------------------------------------------
_settings: Optional[Dict[str, object]] = None
_service: Optional[SegmentationService] = None
_build_lock = threading.Lock()


def configure(model_path: str, **kwargs) -> None:
    global _settings
    _settings = {"model_path": model_path, **kwargs}


def get_segmentation_service() -> SegmentationService:
    global _service
    if _service is None:
        with _build_lock:
            if _service is None:
                if _settings is None:
                    raise RuntimeError(
                        "segmentation_service.configure() must be called before first use"
                    )
                _service = SegmentationService(**_settings)
                _service.load()
    return _service