"""Body-photo analysis: detection + pose + segmentation in one call.

Shared by:
  * POST /api/body-photos (users route) — stores the analysis JSON on the row.
  * The try-on pipeline — re-verifies a person is present before generation.

All heavy inference services are lazy singletons; this module only composes
their results. It never persists anything itself — temporary uploads are the
caller's responsibility (and are deleted by the caller in a finally block).
"""
from __future__ import annotations

import logging
from typing import Dict

from services import pose_service, segmentation_service
from services.yolo_service import get_yolo_service

logger = logging.getLogger(__name__)


def analyze_body_image(image_path: str) -> Dict:
    """Run detection + pose + segmentation on one image path.

    Returns a JSON-serialisable dict:
        {
          "personDetected": bool,
          "personConfidence": float | None,
          "detections": [...],
          "pose": {...},
          "segmentation": {...},
        }
    """
    detection = get_yolo_service().detect(image_path=image_path)
    pose = pose_service.get_pose_service().detect(image_path)
    segmentation = segmentation_service.get_segmentation_service().detect(image_path)

    person_detected = (
        pose.person_detected
        or segmentation.person_detected
        or any(d.get("class") == "person" for d in (detection.detections or []))
    )
    person_conf = next(
        (
            d.get("confidence")
            for d in (detection.detections or [])
            if d.get("class") == "person"
        ),
        None,
    )

    logger.info(
        "Body analysis: person=%s conf=%s detections=%d pose_points=%d masks=%d",
        person_detected,
        person_conf,
        len(detection.detections or []),
        len(pose.keypoints),
        segmentation.mask_count,
    )

    return {
        "personDetected": person_detected,
        "personConfidence": person_conf,
        "detections": detection.detections or [],
        "pose": pose.to_dict(),
        "segmentation": segmentation.to_dict(),
    }