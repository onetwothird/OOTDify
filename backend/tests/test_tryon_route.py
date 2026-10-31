"""HTTP tests for POST /api/tryon: preset models and the daily cap.

Only the try-on blueprint is mounted; the job store and the ownership checks
are faked, auth is seeded on flask.g and consent patched.
"""
from collections import defaultdict, deque

import pytest
from flask import Flask, g

from config import Config
from routes import tryon
from services import ratelimit

URL = "/api/tryon"


class FakeStore:
    def __init__(self):
        self.created = []
        self.recent = 0

    def count_since(self, user_id, since):
        return self.recent

    def create(self, user_id, body_photo_id, clothing_ids, model_preset=None):
        job = {
            "id": "job-1",
            "user_id": user_id,
            "body_photo_id": body_photo_id,
            "model_preset": model_preset,
            "clothing_ids": clothing_ids,
            "status": "queued",
        }
        self.created.append(job)
        return job


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr("services.consent.has_required_consent", lambda user: True)
    monkeypatch.setattr(ratelimit, "_events", defaultdict(deque))
    monkeypatch.setattr(Config, "TRYON_DAILY_LIMIT", 3, raising=False)
    store = FakeStore()
    monkeypatch.setattr(tryon, "_store", lambda: store)
    monkeypatch.setattr(tryon, "_validate_clothing_ids", lambda user_id, ids: [])
    monkeypatch.setattr(tryon, "_owns_body_photo", lambda user_id, photo_id: photo_id == "bp-mine")

    app = Flask(__name__)
    app.register_blueprint(tryon.tryon_bp)

    @app.before_request
    def _fake_user():
        g.current_user = {"id": "user-1", "email": None, "user_metadata": {}}

    return app.test_client(), store


def test_preset_model_job_is_created_without_a_photo(env):
    client, store = env
    res = client.post(URL, json={"model_preset": "ava", "clothing_ids": ["c1"]})
    assert res.status_code == 201
    assert store.created[0]["model_preset"] == "ava"
    assert store.created[0]["body_photo_id"] is None


def test_unknown_preset_is_rejected(env):
    client, store = env
    res = client.post(URL, json={"model_preset": "nobody", "clothing_ids": ["c1"]})
    assert res.status_code == 400
    assert not store.created


def test_needs_a_photo_or_a_preset(env):
    client, _ = env
    assert client.post(URL, json={"clothing_ids": ["c1"]}).status_code == 400


def test_someone_elses_photo_is_not_found(env):
    client, _ = env
    res = client.post(URL, json={"body_photo_id": "bp-theirs", "clothing_ids": ["c1"]})
    assert res.status_code == 404


def test_own_photo_job_is_created(env):
    client, store = env
    res = client.post(URL, json={"body_photo_id": "bp-mine", "clothing_ids": ["c1"]})
    assert res.status_code == 201
    assert store.created[0]["model_preset"] is None


def test_daily_cap_returns_429(env):
    client, store = env
    store.recent = 3
    res = client.post(URL, json={"model_preset": "ava", "clothing_ids": ["c1"]})
    assert res.status_code == 429
    assert "today" in res.get_json()["error"]
    assert not store.created
