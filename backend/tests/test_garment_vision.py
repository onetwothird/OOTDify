"""Garment vision: reply parsing, cropping, and the isolate route integration.

The Anthropic call itself is never made — `describe_garment` is replaced with a
fake, and `parse_reply` is exercised directly on realistic model output.
"""
import base64
from collections import defaultdict, deque
from io import BytesIO

import pytest
from flask import Flask, g
from PIL import Image, ImageDraw

from config import Config
from routes import detection
from services import garment_vision, ratelimit
from services.garment_vision import GarmentDescription


# ---------------------------------------------------------------- parse_reply
def test_parse_reply_reads_a_garment():
    reply = (
        'Sure!\n{"found": true, "category": "Tops", "name": "Navy t-shirt", '
        '"color": "navy", "pattern": "solid", "fit": "relaxed", '
        '"description": "Short-sleeve crew neck.", '
        '"box": {"x": 0.2, "y": 0.3, "w": 0.5, "h": 0.4}}'
    )
    garment = garment_vision.parse_reply(reply)
    assert garment.found is True
    assert garment.category == "Tops"
    assert garment.name == "Navy t-shirt"
    assert garment.box == (0.2, 0.3, 0.5, 0.4)


def test_parse_reply_not_found_has_no_box():
    garment = garment_vision.parse_reply('{"found": false}')
    assert garment.found is False
    assert garment.box is None


def test_parse_reply_drops_unknown_category_and_clamps_box():
    garment = garment_vision.parse_reply(
        '{"found": true, "category": "Spaceships", "name": "Top", '
        '"box": {"x": 0.8, "y": 0.1, "w": 0.9, "h": 0.5}}'
    )
    assert garment.category is None
    x, y, w, h = garment.box
    assert x + w <= 1.0


def test_parse_reply_rejects_a_degenerate_box_as_not_found():
    garment = garment_vision.parse_reply(
        '{"found": true, "box": {"x": 0.1, "y": 0.1, "w": 0.01, "h": 0.01}}'
    )
    assert garment.found is False


def test_parse_reply_raises_on_junk():
    with pytest.raises(garment_vision.GarmentVisionError):
        garment_vision.parse_reply("I cannot help with that.")


# ---------------------------------------------------------------- crop_to_box
def test_crop_to_box_returns_only_the_boxed_area(tmp_path):
    img = Image.new("RGB", (400, 400), (255, 255, 255))
    ImageDraw.Draw(img).rectangle([100, 100, 300, 300], fill=(10, 20, 200))
    path = tmp_path / "p.jpg"
    img.save(path, format="JPEG")

    jpeg = garment_vision.crop_to_box(path, (0.25, 0.25, 0.5, 0.5), padding=0)
    out = Image.open(BytesIO(jpeg))
    assert out.size == (200, 200)


# --------------------------------------------------------------------- route
@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(Config, "UPLOAD_FOLDER", tmp_path)
    monkeypatch.setattr("services.consent.has_required_consent", lambda user: True)
    monkeypatch.setattr(ratelimit, "_events", defaultdict(deque))

    app = Flask(__name__)
    app.register_blueprint(detection.detection_bp)

    @app.before_request
    def _fake_user():
        g.current_user = {"id": "user-1", "email": None, "user_metadata": {}}

    return app.test_client()


def _person_photo() -> BytesIO:
    img = Image.new("RGB", (480, 640), (215, 210, 205))
    draw = ImageDraw.Draw(img)
    draw.ellipse([190, 40, 290, 140], fill=(200, 150, 120))  # head
    draw.rectangle([150, 160, 330, 380], fill=(25, 35, 110))  # t-shirt
    draw.rectangle([170, 380, 310, 620], fill=(60, 60, 60))  # trousers
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=95)
    buf.seek(0)
    return buf


def _post(client):
    return client.post(
        "/api/clothing/isolate",
        data={"image": (_person_photo(), "me.jpg")},
        content_type="multipart/form-data",
    )


def test_route_crops_to_the_described_garment(client, monkeypatch):
    monkeypatch.setattr(garment_vision, "is_configured", lambda: True)
    monkeypatch.setattr(
        garment_vision,
        "describe_garment",
        lambda path: GarmentDescription(
            found=True,
            category="Tops",
            name="Navy t-shirt",
            color="navy",
            description="Short-sleeve crew neck.",
            box=(150 / 480, 160 / 640, 180 / 480, 220 / 640),
        ),
    )
    body = _post(client).get_json()
    assert body["success"] is True
    assert body["garment"]["name"] == "Navy t-shirt"
    assert body["garment"]["category"] == "Tops"
    out = Image.open(BytesIO(base64.b64decode(body["isolation"]["image_base64"])))
    # The cut-out is the t-shirt region, far smaller than the 480x640 photo.
    assert out.size[0] < 300 and out.size[1] < 330


def test_route_falls_back_to_plain_isolation_when_vision_fails(client, monkeypatch):
    monkeypatch.setattr(garment_vision, "is_configured", lambda: True)

    def boom(path):
        raise garment_vision.GarmentVisionError("down")

    monkeypatch.setattr(garment_vision, "describe_garment", boom)
    body = _post(client).get_json()
    assert body["success"] is True
    assert body["garment"] is None
    assert "ok" in body["isolation"]


def test_route_skips_vision_when_not_configured(client, monkeypatch):
    monkeypatch.setattr(garment_vision, "is_configured", lambda: False)

    def must_not_run(path):
        raise AssertionError("vision must not be called without a key")

    monkeypatch.setattr(garment_vision, "describe_garment", must_not_run)
    body = _post(client).get_json()
    assert body["success"] is True
    assert body["garment"] is None
