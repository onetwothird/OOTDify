"""HTTP tests for GET /api/clothing/<item_id>/cutout.

Only the cutout blueprint is mounted. Supabase rows, image download and the
isolation itself are faked; auth is seeded on flask.g and consent patched.
"""
import base64
from collections import defaultdict, deque

import pytest
from flask import Flask, g

from config import Config
from routes import cutout
from services import ratelimit, tryon_service
from services.garment_isolation import IsolationResult

PNG = b"\x89PNG\r\n\x1a\nfake"


@pytest.fixture
def env(monkeypatch, tmp_path):
    monkeypatch.setattr(Config, "UPLOAD_FOLDER", tmp_path)
    monkeypatch.setattr("services.consent.has_required_consent", lambda user: True)
    monkeypatch.setattr(ratelimit, "_events", defaultdict(deque))
    state = {"item": {"image_url": "https://x/a.jpg", "category": "tops"}, "result": IsolationResult(ok=True, png=PNG, width=10, height=20), "seen": {}}

    def fake_resolve(user_id, item_id):
        state["seen"]["lookup"] = (user_id, item_id)
        return state["item"]

    def fake_isolate(path, parser=None, *, transparent=False):
        state["seen"]["transparent"] = transparent
        state["seen"]["path"] = path
        return state["result"]

    monkeypatch.setattr(tryon_service, "resolve_clothing_item", fake_resolve)
    monkeypatch.setattr(tryon_service, "_resolve_image_bytes", lambda ref: b"imagebytes")
    monkeypatch.setattr(cutout, "isolate_garment", fake_isolate)

    app = Flask(__name__)
    app.register_blueprint(cutout.cutout_bp)
    authed = {"on": True}

    @app.before_request
    def _fake_user():
        if authed["on"]:
            g.current_user = {"id": "user-1", "email": None, "user_metadata": {}}

    state["client"] = app.test_client()
    state["authed"] = authed
    return state


def test_cutout_own_item_returns_png(env, tmp_path):
    resp = env["client"].get("/api/clothing/i1/cutout")
    body = resp.get_json()
    assert resp.status_code == 200, body
    assert body["success"] is True
    assert body["cutout"]["ok"] is True
    assert base64.b64decode(body["cutout"]["png_base64"]) == PNG
    assert (body["cutout"]["width"], body["cutout"]["height"]) == (10, 20)
    assert env["seen"]["lookup"] == ("user-1", "i1")
    assert env["seen"]["transparent"] is True
    assert list(tmp_path.iterdir()) == []  # temp file deleted


def test_cutout_catalog_item_returns_png(env):
    env["item"] = {"image_url": "wardrobe/cat.jpg", "category": None}
    resp = env["client"].get("/api/clothing/cat1/cutout")
    assert resp.status_code == 200
    assert resp.get_json()["cutout"]["ok"] is True


def test_cutout_other_users_item_is_404(env):
    env["item"] = None
    resp = env["client"].get("/api/clothing/theirs/cutout")
    assert resp.status_code == 404
    assert resp.get_json()["success"] is False


def test_cutout_failed_isolation_returns_ok_false_without_image(env):
    env["result"] = IsolationResult(ok=False, reason="no_object")
    resp = env["client"].get("/api/clothing/i1/cutout")
    body = resp.get_json()
    assert resp.status_code == 200
    assert body["cutout"] == {"ok": False, "reason": "no_object", "png_base64": None, "width": None, "height": None}


def test_cutout_requires_auth(env):
    env["authed"]["on"] = False
    resp = env["client"].get("/api/clothing/i1/cutout")
    assert resp.status_code == 401
