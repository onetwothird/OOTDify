"""Evaluation of the profile-photo (selfie) check.

The route uploads a selfie, `body_analysis.analyze_body_image` runs the real
detection + pose models on it, and this module turns those measurements into a
small verdict. It is a pure function over the analysis dict so it can be unit
tested without loading any model weights.

What this check genuinely establishes, and what it does not:

  * it DOES confirm that the models found a person and located facial keypoints
    (nose, eyes, ears) with real confidence values;
  * it does NOT prove identity, and it does not detect a photo-of-a-photo. It is
    an image-quality/presence check, so the UI must not label it as ID
    verification. Certified identity checks require a dedicated provider.
"""
from __future__ import annotations

from typing import Dict, Optional

# The five facial points in the COCO-17 skeleton the pose model emits.
FACE_KEYPOINTS = ("nose", "left_eye", "right_eye", "left_ear", "right_ear")

# A keypoint counts as "located" at or above this confidence.
KEYPOINT_CONFIDENCE = 0.5

# How many facial keypoints must be visible to call the face usable.
MIN_FACE_KEYPOINTS = 3


def _confident_names(keypoints) -> set:
    names = set()
    for kp in keypoints or []:
        if not isinstance(kp, dict):
            continue
        name = kp.get("name")
        try:
            confidence = float(kp.get("confidence") or 0)
        except (TypeError, ValueError):
            confidence = 0.0
        if isinstance(name, str) and confidence >= KEYPOINT_CONFIDENCE:
            names.add(name)
    return names


def evaluate_photo_check(analysis: Dict) -> Dict:
    """Reduce a body-analysis result to the photo-check verdict."""
    pose = analysis.get("pose") or {}
    if not isinstance(pose, dict):
        pose = {}
    confident = _confident_names(pose.get("keypoints"))

    face_keypoints = sum(1 for name in FACE_KEYPOINTS if name in confident)
    keypoints_visible = len(confident)
    person_detected = bool(analysis.get("personDetected"))

    confidence = analysis.get("personConfidence")
    try:
        confidence = float(confidence) if confidence is not None else None
    except (TypeError, ValueError):
        confidence = None

    ok = person_detected and face_keypoints >= MIN_FACE_KEYPOINTS

    reason: Optional[str] = None
    if not person_detected:
        reason = "no_person"
    elif face_keypoints < MIN_FACE_KEYPOINTS:
        reason = "face_not_visible"

    return {
        "ok": ok,
        "personDetected": person_detected,
        "personConfidence": confidence,
        "faceKeypoints": face_keypoints,
        "keypointsVisible": keypoints_visible,
        "reason": reason,
    }
