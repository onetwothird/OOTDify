"""HTTP tests for the profile cover photo: POST /api/profile/cover and removing
it through PATCH /api/profile.

Only the users blueprint is mounted. Auth is satisfied by pre-seeding flask.g
the way require_user caches it; Supabase, image ingest and Cloudinary are
replaced so the test sees exactly what would be written.
"""
import io
from collections import defaultdict, deque

import pytest
from flask import Flask, g

from routes import users
from services import cloudinary_service, ratelimit


class _Recorder:
    """Stands in for the supabase client: table().update().eq().execute()."""

    def __init__(self):
        self.updates = []

    def table(self, _name):
        return self

    def update(self, values):
        self.updates.append(values)
        self._last = values
        return self

    def eq(self, *_args):
        return self

    def execute(self):
        return type("R", (), {"data": [{"user_id": "user-1", **self._last}]})()


@pytest.fixture
def db(monkeypatch):
    recorder = _Recorder()
    monkeypatch.setattr(users, "get_supabase", lambda: recorder)
    monkeypatch.setattr(users, "ensure_profile", lambda user_id: {"user_id": user_id})
    monkeypatch.setattr(ratelimit, "_events", defaultdict(deque))
    monkeypatch.setattr(users.image_service, "ingest_upload", lambda *a, **k: "/tmp/cover.jpg")
    monkeypatch.setattr(users.image_service, "cleanup", lambda path: None)
    return recorder


@pytest.fixture
def client(db):
    app = Flask(__name__)
    app.register_blueprint(users.users_bp)

    @app.before_request
    def _fake_user():
        g.current_user = {"id": "user-1", "email": None, "user_metadata": {}}

    return app.test_client()


def _upload(client):
    return client.post(
        "/api/profile/cover",
        data={"image": (io.BytesIO(b"fake"), "cover.jpg")},
        content_type="multipart/form-data",
    )


def test_uploads_and_saves_the_cover_url(client, db, monkeypatch):
    seen = {}

    def fake_upload(user_id, path):
        seen["user_id"] = user_id
        return "https://res.cloudinary.com/demo/image/upload/cover.jpg"

    monkeypatch.setattr(cloudinary_service, "upload_cover", fake_upload)
    resp = _upload(client)

    assert resp.status_code == 200, resp.get_json()
    assert seen["user_id"] == "user-1"
    assert db.updates[-1]["cover_url"] == "https://res.cloudinary.com/demo/image/upload/cover.jpg"
    assert resp.get_json()["profile"]["cover_url"].endswith("cover.jpg")


def test_missing_image_is_rejected(client, db):
    resp = client.post("/api/profile/cover", data={}, content_type="multipart/form-data")
    assert resp.status_code == 400
    assert db.updates == []


def test_unconfigured_cloudinary_is_reported_honestly(client, db, monkeypatch):
    def not_configured(*_a):
        raise cloudinary_service.CloudinaryNotConfiguredError("nope")

    monkeypatch.setattr(cloudinary_service, "upload_cover", not_configured)
    resp = _upload(client)

    assert resp.status_code == 503
    assert db.updates == []


def test_patch_can_remove_the_cover(client, db):
    resp = client.patch("/api/profile", json={"cover_url": None})
    assert resp.status_code == 200, resp.get_json()
    assert db.updates[-1]["cover_url"] is None


def test_patch_cannot_point_the_cover_at_an_arbitrary_url(client, db):
    resp = client.patch("/api/profile", json={"cover_url": "https://evil.example/x.jpg"})
    assert resp.status_code == 400
    assert db.updates == []


def test_cloudinary_rejection_says_so(client, db, monkeypatch):
    def rejected(*_a):
        raise cloudinary_service.CloudinaryError("Could not upload image: Invalid Signature")

    monkeypatch.setattr(cloudinary_service, "upload_cover", rejected)
    resp = _upload(client)

    assert resp.status_code == 502
    assert "Cloudinary" in resp.get_json()["error"]
    assert db.updates == []


def test_profile_save_failure_says_so(client, db, monkeypatch):
    monkeypatch.setattr(cloudinary_service, "upload_cover", lambda *_a: "https://x/cover.jpg")

    def broken_update(_values):
        raise RuntimeError("column user_profiles.cover_url does not exist")

    monkeypatch.setattr(db, "update", broken_update)
    resp = _upload(client)

    assert resp.status_code == 500
    assert "saved" in resp.get_json()["error"]
