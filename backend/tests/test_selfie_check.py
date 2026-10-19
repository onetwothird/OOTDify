"""Unit tests for the profile photo check (services/selfie_check.py).

Pure logic tests — no HTTP layer, no model weights. The analysis dicts below
mirror exactly what `body_analysis.analyze_body_image` returns.
"""
from services.selfie_check import (
    FACE_KEYPOINTS,
    MIN_FACE_KEYPOINTS,
    evaluate_photo_check,
)


def _kp(name: str, confidence: float) -> dict:
    return {"name": name, "x": 0.5, "y": 0.5, "confidence": confidence}


def _analysis(keypoints, person_detected=True, confidence=0.91) -> dict:
    return {
        "personDetected": person_detected,
        "personConfidence": confidence,
        "detections": [],
        "pose": {"keypoints": keypoints, "personDetected": person_detected},
        "segmentation": {"maskCount": 1},
    }


class TestEvaluatePhotoCheck:
    def test_person_with_visible_face_passes(self):
        keypoints = [_kp(name, 0.9) for name in FACE_KEYPOINTS]
        keypoints.append(_kp("left_shoulder", 0.8))

        check = evaluate_photo_check(_analysis(keypoints))

        assert check["ok"] is True
        assert check["personDetected"] is True
        assert check["personConfidence"] == 0.91
        assert check["faceKeypoints"] == len(FACE_KEYPOINTS)
        assert check["keypointsVisible"] == len(FACE_KEYPOINTS) + 1
        assert check["reason"] is None

    def test_no_person_is_reported(self):
        check = evaluate_photo_check(_analysis([], person_detected=False, confidence=None))

        assert check["ok"] is False
        assert check["reason"] == "no_person"
        assert check["personConfidence"] is None

    def test_person_without_visible_face_is_reported(self):
        # Body keypoints only: the model found a body but no usable face.
        keypoints = [_kp("left_shoulder", 0.9), _kp("right_shoulder", 0.9)]
        check = evaluate_photo_check(_analysis(keypoints))

        assert check["ok"] is False
        assert check["reason"] == "face_not_visible"
        assert check["faceKeypoints"] == 0

    def test_low_confidence_keypoints_do_not_count(self):
        # Present but below the threshold — must not be treated as located.
        keypoints = [_kp(name, 0.2) for name in FACE_KEYPOINTS]
        check = evaluate_photo_check(_analysis(keypoints))

        assert check["faceKeypoints"] == 0
        assert check["ok"] is False

    def test_boundary_confidence_is_inclusive(self):
        keypoints = [_kp(name, 0.5) for name in FACE_KEYPOINTS]
        check = evaluate_photo_check(_analysis(keypoints))

        assert check["faceKeypoints"] == len(FACE_KEYPOINTS)
        assert check["ok"] is True

    def test_minimum_face_keypoints_decides(self):
        below = [_kp(name, 0.9) for name in FACE_KEYPOINTS[: MIN_FACE_KEYPOINTS - 1]]
        at = [_kp(name, 0.9) for name in FACE_KEYPOINTS[:MIN_FACE_KEYPOINTS]]

        assert evaluate_photo_check(_analysis(below))["ok"] is False
        assert evaluate_photo_check(_analysis(at))["ok"] is True

    def test_missing_pose_block_is_handled(self):
        check = evaluate_photo_check({"personDetected": False})

        assert check["ok"] is False
        assert check["reason"] == "no_person"
        assert check["faceKeypoints"] == 0
        assert check["keypointsVisible"] == 0

    def test_malformed_entries_are_ignored(self):
        # None / non-dict / bad confidence values must not raise.
        keypoints = [
            None,
            "nose",
            {"name": None, "confidence": 0.9},
            {"name": "nose", "confidence": "not-a-number"},
            {"name": "left_eye", "confidence": 0.9},
            {"name": "right_eye", "confidence": 0.9},
            {"name": "left_ear", "confidence": 0.9},
        ]
        check = evaluate_photo_check(_analysis(keypoints))

        assert check["faceKeypoints"] == 3
        assert check["ok"] is True

    def test_non_numeric_person_confidence_is_nulled(self):
        check = evaluate_photo_check(_analysis([], confidence="high"))

        assert check["personConfidence"] is None
