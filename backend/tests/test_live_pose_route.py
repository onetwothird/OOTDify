"""HTTP tests for POST /api/tryon/live/pose (live try-on preview).

Only the pose blueprint is mounted and the pose model is replaced by a fake,
so no weights load. Auth is satisfied by pre-seeding flask.g the way
require_user caches it, and consent is patched — both are covered elsewhere.
"""
from collections import defaultdict, deque
from io import BytesIO

import pytest
from flask import Flask, g
from PIL import Image

from config import Config
from routes import pose
from services import pose_service, ratelimit
from services.pose_service import PersonPose, PoseResult


def _kp(name, x, y, confidence=0.9):
    return {"name": name, "x": x, "y": y, "confidence": confidence}


class FakePose:
    def __init__(self, poses):
        self.poses = poses
        self.calls = []

    def estimate(self, image_path, save_annotated=False, output_dir=None, image_size=None):
        self.calls.append({"save_annotated": save_annotated, "image_size": image_size})
        return PoseResult(success=True, poses=self.poses, elapsed_ms=12.5, model_name="fake")


@pytest.fixture
def upload_dir(tmp_path):
    folder = tmp_path / "uploads"
    folder.mkdir()
    return folder


@pytest.fixture
def client(monkeypatch, upload_dir):
    monkeypatch.setattr("services.consent.has_required_consent", lambda user: True)
    # Fresh rate-limit window per test.
    monkeypatch.setattr(ratelimit, "_events", defaultdict(deque))

    app = Flask(__name__)
    app.config["UPLOAD_FOLDER"] = upload_dir
    app.config["OUTPUT_FOLDER"] = upload_dir
    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024
    app.register_blueprint(pose.pose_bp)

    @app.before_request
    def _fake_user():
        g.current_user = {"id": "user-1", "email": None, "user_metadata": {}}

    return app.test_client()


def _use(monkeypatch, fake):
    monkeypatch.setattr(pose, "get_pose_service", lambda: fake)
    return fake


@pytest.fixture
def fake_pose(monkeypatch):
    person = PersonPose(keypoints=[_kp("nose", 320, 120)], person_detected=True)
    return _use(monkeypatch, FakePose([person]))


def post(client, size=(640, 480)):
    buf = BytesIO()
    Image.new("RGB", size, (200, 200, 200)).save(buf, format="JPEG")
    buf.seek(0)
    return client.post(
        "/api/tryon/live/pose",
        data={"image": (buf, "frame.jpg")},
        content_type="multipart/form-data",
    )


def test_returns_normalized_keypoints(client, fake_pose):
    resp = post(client)
    body = resp.get_json()
    assert resp.status_code == 200, body
    assert body["success"] is True and body["personDetected"] is True
    kp = body["keypoints"][0]
    assert kp["x"] == 0.5 and kp["y"] == 0.25
    assert kp["name"] == "nose" and kp["confidence"] == 0.9
    assert body["imageWidth"] == 640 and body["imageHeight"] == 480
    assert body["inference_ms"] == 12.5


def test_runs_pose_at_live_image_size(client, fake_pose):
    post(client)
    assert fake_pose.calls[-1]["image_size"] == 320
    assert fake_pose.calls[-1]["save_annotated"] is False


def test_no_person_is_200_not_error(client, monkeypatch):
    _use(monkeypatch, FakePose([]))
    resp = post(client)
    body = resp.get_json()
    assert resp.status_code == 200
    assert body["personDetected"] is False and body["keypoints"] == []


def test_missing_image_is_400(client, fake_pose):
    resp = client.post("/api/tryon/live/pose", data={}, content_type="multipart/form-data")
    assert resp.status_code == 400
    assert resp.get_json()["success"] is False


def test_inference_failure_is_500(client, monkeypatch):
    class Broken(FakePose):
        def estimate(self, *args, **kwargs):
            return PoseResult(success=False, error="Pose inference failed: boom")

    _use(monkeypatch, Broken([]))
    resp = post(client)
    assert resp.status_code == 500
    assert resp.get_json()["success"] is False


def test_upload_is_deleted_after_inference(client, fake_pose, upload_dir):
    assert post(client).status_code == 200
    assert fake_pose.calls, "inference must have run on a stored upload"
    assert list(upload_dir.iterdir()) == []


def test_picks_largest_person(client, monkeypatch):
    small = PersonPose(
        keypoints=[_kp("left_shoulder", 100, 100), _kp("right_shoulder", 120, 100), _kp("left_hip", 100, 140)],
        person_detected=True,
    )
    large = PersonPose(
        keypoints=[_kp("left_shoulder", 256, 96), _kp("right_shoulder", 384, 96), _kp("left_hip", 256, 336)],
        person_detected=True,
    )
    _use(monkeypatch, FakePose([small, large]))
    body = post(client).get_json()
    assert body["keypoints"][0]["x"] == 0.4  # 256 / 640


def test_live_limit_is_per_minute_rule(client, fake_pose, monkeypatch):
    monkeypatch.setattr(Config, "RATE_LIMIT_LIVE_MAX", 3)
    statuses = [post(client).status_code for _ in range(4)]
    assert statuses == [200, 200, 200, 429]


def test_live_limit_is_separate_from_upload_limit(client, fake_pose):
    assert Config.RATE_LIMIT_LIVE_MAX == 240 and Config.RATE_LIMIT_LIVE_WINDOW == 60
    statuses = {post(client).status_code for _ in range(Config.RATE_LIMIT_UPLOAD_MAX + 5)}
    assert statuses == {200}


def test_normalize_keypoints_clamps():
    out = pose_service.normalize_keypoints([_kp("nose", 700, -5)], 640, 480)
    assert out[0]["x"] == 1.0 and out[0]["y"] == 0.0
    assert out[0]["name"] == "nose" and out[0]["confidence"] == 0.9


def test_normalize_keypoints_rounds_to_4_places():
    out = pose_service.normalize_keypoints([_kp("nose", 100, 100)], 300, 300)
    assert out[0]["x"] == 0.3333
