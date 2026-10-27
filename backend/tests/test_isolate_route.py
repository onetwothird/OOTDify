"""HTTP tests for POST /api/clothing/isolate.

Only the detection blueprint is mounted (no model loading, no try-on worker).
Auth is satisfied by pre-seeding flask.g the way require_user caches it, and
consent is patched — both are covered by their own code paths elsewhere.
"""
import base64
from collections import defaultdict, deque
from io import BytesIO

import pytest
from flask import Flask, g
from PIL import Image, ImageDraw

from config import Config
from routes import detection
from services import ratelimit


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(Config, "UPLOAD_FOLDER", tmp_path)
    monkeypatch.setattr("services.consent.has_required_consent", lambda user: True)
    # Fresh rate-limit window per test so uploads never trip the hourly cap.
    monkeypatch.setattr(ratelimit, "_events", defaultdict(deque))

    app = Flask(__name__)
    app.register_blueprint(detection.detection_bp)

    @app.before_request
    def _fake_user():
        g.current_user = {"id": "user-1", "email": None, "user_metadata": {}}

    return app.test_client()


def _jpeg(img: Image.Image) -> BytesIO:
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=95)
    buf.seek(0)
    return buf


def _garment_photo() -> Image.Image:
    img = Image.new("RGB", (480, 640), (215, 210, 205))
    ImageDraw.Draw(img).rectangle([150, 190, 330, 510], fill=(25, 35, 110))
    return img


def test_returns_cutout_for_a_garment(client):
    resp = client.post(
        "/api/clothing/isolate",
        data={"image": (_jpeg(_garment_photo()), "shirt.jpg")},
        content_type="multipart/form-data",
    )
    body = resp.get_json()
    assert resp.status_code == 200, body
    assert body["isolation"]["ok"] is True
    out = Image.open(BytesIO(base64.b64decode(body["isolation"]["image_base64"])))
    assert out.format == "JPEG"


def test_blank_photo_returns_no_image(client):
    resp = client.post(
        "/api/clothing/isolate",
        data={"image": (_jpeg(Image.new("RGB", (480, 640), (200, 200, 200))), "blank.jpg")},
        content_type="multipart/form-data",
    )
    body = resp.get_json()
    assert resp.status_code == 200
    assert body["isolation"]["ok"] is False
    assert body["isolation"]["image_base64"] is None


def test_missing_image_is_rejected(client):
    resp = client.post("/api/clothing/isolate", data={}, content_type="multipart/form-data")
    assert resp.status_code == 400


def test_non_image_is_rejected(client):
    resp = client.post(
        "/api/clothing/isolate",
        data={"image": (BytesIO(b"not an image"), "fake.jpg")},
        content_type="multipart/form-data",
    )
    assert resp.status_code == 400
