"""Pose estimation service (Ultralytics YOLOv8-pose).

Lazy process-wide singleton (same pattern as yolo_service). yolov8n-pose.pt
is auto-downloaded by Ultralytics on first load if missing.

Exposes two entry points:
  * detect(image_path)  → summary used by body analysis / try-on pipeline
  * estimate(image_path, save_annotated, output_dir) → full per-person poses
    + optional annotated preview (served by /api/pose/annotated/<file>).

PRIVACY: this service never persists anything itself. Callers own the
temporary upload lifecycle (they delete temp files in a finally block).
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

# COCO keypoint names (17) — part of the API contract.
KEYPOINT_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
]


@dataclass
class PersonPose:
    """Keypoints of one detected person."""

    keypoints: List[dict] = field(default_factory=list)
    person_detected: bool = False

    def to_dict(self) -> dict:
        return {"keypoints": self.keypoints, "personDetected": self.person_detected}


@dataclass
class PoseResult:
    success: bool
    poses: List[PersonPose] = field(default_factory=list)  # one per person
    annotated_filename: Optional[str] = None
    elapsed_ms: Optional[float] = None
    model_name: Optional[str] = None
    error: Optional[str] = None

    @property
    def person_detected(self) -> bool:
        return any(p.person_detected for p in self.poses)

    @property
    def keypoints(self) -> List[dict]:
        """Flat keypoint list of the first person (summary contract)."""
        return self.poses[0].keypoints if self.poses else []

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "poses": [p.to_dict() for p in self.poses],
            "personDetected": self.person_detected,
            "keypoints": self.keypoints,
            "annotated_image_url": (
                f"/api/pose/annotated/{self.annotated_filename}"
                if self.annotated_filename
                else None
            ),
            "inference_ms": self.elapsed_ms,
            "model": self.model_name,
            "error": self.error,
        }


class PoseService:
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
            logger.info("Loading pose model from %s ...", self.model_path)
            started = time.perf_counter()
            self._model = YOLO(self.model_path)
            logger.info("Pose model ready in %.2fs", time.perf_counter() - started)
            return self._model

    @property
    def model(self) -> YOLO:
        return self._model if self._model is not None else self.load()

    @property
    def model_name(self) -> str:
        return Path(self.model_path).stem

    # -------------------------------------------------------------- inference
    def detect(self, image_path: str | Path) -> PoseResult:
        """Summary pose run (no annotated preview) — used by body analysis."""
        return self.estimate(image_path, save_annotated=False, output_dir=None)

    def estimate(
        self,
        image_path: str | Path,
        save_annotated: bool = False,
        output_dir: Optional[str | Path] = None,
    ) -> PoseResult:
        """Run pose inference; returns per-person keypoints (+ optional preview)."""
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
            logger.exception("Pose inference failed")
            return PoseResult(success=False, error=f"Pose inference failed: {exc}")

        elapsed_ms = (time.perf_counter() - started) * 1000.0
        poses: List[PersonPose] = []

        for result in results:
            kpts = result.keypoints
            if kpts is None or len(kpts.data) == 0:
                continue
            for person in kpts.data.cpu().tolist():
                keypoints: List[dict] = []
                for idx, pt in enumerate(person[: len(KEYPOINT_NAMES)]):
                    x, y, conf = (float(v) for v in pt)
                    if conf <= 0.0 and x <= 0 and y <= 0:
                        continue
                    keypoints.append(
                        {
                            "name": KEYPOINT_NAMES[idx] if idx < len(KEYPOINT_NAMES) else str(idx),
                            "x": round(x, 1),
                            "y": round(y, 1),
                            "confidence": round(conf, 4),
                        }
                    )
                if keypoints:
                    poses.append(PersonPose(keypoints=keypoints, person_detected=True))

        annotated_filename: Optional[str] = None
        if save_annotated and results:
            try:
                annotated_filename = image_service.save_annotated_plot(
                    results,
                    output_dir or Path("."),
                    Path(image_path).stem,
                )
            except Exception as exc:
                logger.warning("Could not save annotated pose image: %s", exc)

        return PoseResult(
            success=True,
            poses=poses,
            annotated_filename=annotated_filename,
            elapsed_ms=round(elapsed_ms, 1),
            model_name=self.model_name,
        )


# --------------------------------------------------------------------------
# Lazy process-wide singleton
# --------------------------------------------------------------------------
_settings: Optional[Dict[str, object]] = None
_service: Optional[PoseService] = None
_build_lock = threading.Lock()


def configure(model_path: str, **kwargs) -> None:
    global _settings
    _settings = {"model_path": model_path, **kwargs}


def get_pose_service() -> PoseService:
    global _service
    if _service is None:
        with _build_lock:
            if _service is None:
                if _settings is None:
                    raise RuntimeError("pose_service.configure() must be called before first use")
                _service = PoseService(**_settings)
                _service.load()
    return _service