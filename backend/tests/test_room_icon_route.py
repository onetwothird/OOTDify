"""HTTP tests for POST /api/community/rooms/<room_id>/icon.

Only the community blueprint is mounted. Auth is satisfied by pre-seeding
flask.g; Supabase, image ingest and Cloudinary are replaced so the test sees
exactly what would be written.
"""
import io
from collections import defaultdict, deque

import pytest
from flask import Flask, g

from routes import community
from services import cloudinary_service, ratelimit

ROOM = "11111111-2222-3333-4444-555555555555"


class _Db:
    """table().select().eq().limit().execute() and table().update().eq().execute().

    Two tables: conversations (keyed by id) and conversation_admins, whose rows
    are (room, user) pairs matched on both columns.
    """

    def __init__(self, rooms, admins=()):
        self.rooms = rooms
        self.admins = set(admins)
        self.updates = []
        self._pending = None
        self._table = None
        self._filters = {}

    def table(self, name):
        self._table = name
        self._filters = {}
        return self

    def select(self, *_a):
        self._pending = None
        return self

    def update(self, values):
        self._pending = values
        return self

    def eq(self, col, value):
        self._filters[col] = value
        return self

    def limit(self, _n):
        return self

    def execute(self):
        if self._table == "conversation_admins":
            key = (self._filters.get("conversation_id"), self._filters.get("user_id"))
            return type("R", (), {"data": [{"user_id": key[1]}] if key in self.admins else []})()
        row = self.rooms.get(self._filters.get("id"))
        if self._pending is not None:
            self.updates.append(self._pending)
            row = {**row, **self._pending}
        return type("R", (), {"data": [row] if row else []})()


@pytest.fixture
def db(monkeypatch):
    fake = _Db(
        {ROOM: {"id": ROOM, "created_by": "owner", "icon_url": None, "icon_preset": "sparkles"}},
        admins={(ROOM, "co-admin")},
    )
    monkeypatch.setattr(community, "get_supabase", lambda: fake)
    monkeypatch.setattr(ratelimit, "_events", defaultdict(deque))
    monkeypatch.setattr(community.image_service, "ingest_upload", lambda *a, **k: "/tmp/icon.jpg")
    monkeypatch.setattr(community.image_service, "cleanup", lambda path: None)
    return fake


def _client(user_id):
    app = Flask(__name__)
    app.register_blueprint(community.community_bp)

    @app.before_request
    def _fake_user():
        g.current_user = {"id": user_id, "email": None, "user_metadata": {}}

    return app.test_client()


def _upload(client, room=ROOM):
    return client.post(
        f"/api/community/rooms/{room}/icon",
        data={"image": (io.BytesIO(b"fake"), "icon.jpg")},
        content_type="multipart/form-data",
    )


def test_owner_uploads_and_the_photo_replaces_the_preset(db, monkeypatch):
    seen = {}

    def fake_upload(user_id, path):
        seen["user_id"] = user_id
        return "https://res.cloudinary.com/demo/image/upload/room.jpg"

    monkeypatch.setattr(cloudinary_service, "upload_room_icon", fake_upload)
    resp = _upload(_client("owner"))

    assert resp.status_code == 200, resp.get_json()
    assert seen["user_id"] == "owner"
    assert db.updates[-1] == {"icon_url": "https://res.cloudinary.com/demo/image/upload/room.jpg", "icon_preset": None}
    assert resp.get_json()["room"]["icon_url"].endswith("room.jpg")


def test_a_listed_admin_can_change_the_icon_too(db, monkeypatch):
    monkeypatch.setattr(cloudinary_service, "upload_room_icon", lambda *_a: "https://res.cloudinary.com/demo/image/upload/admin.jpg")
    resp = _upload(_client("co-admin"))
    assert resp.status_code == 200, resp.get_json()
    assert db.updates[-1]["icon_url"].endswith("admin.jpg")


def test_only_an_admin_can_change_the_icon(db, monkeypatch):
    def never(*_a):
        raise AssertionError("must not upload for a non-owner")

    monkeypatch.setattr(cloudinary_service, "upload_room_icon", never)
    resp = _upload(_client("someone-else"))
    assert resp.status_code == 403
    assert db.updates == []


def test_unknown_room_is_404(db, monkeypatch):
    monkeypatch.setattr(cloudinary_service, "upload_room_icon", lambda *_a: "https://x")
    resp = _upload(_client("owner"), room="99999999-2222-3333-4444-555555555555")
    assert resp.status_code == 404
    assert db.updates == []


def test_malformed_room_id_is_404(db):
    resp = _upload(_client("owner"), room="not-a-uuid")
    assert resp.status_code == 404


def test_missing_image_is_rejected(db):
    resp = _client("owner").post(f"/api/community/rooms/{ROOM}/icon", data={}, content_type="multipart/form-data")
    assert resp.status_code == 400
    assert db.updates == []


def test_cloudinary_rejection_says_so(db, monkeypatch):
    def rejected(*_a):
        raise cloudinary_service.CloudinaryError("Could not upload image: Invalid Signature")

    monkeypatch.setattr(cloudinary_service, "upload_room_icon", rejected)
    resp = _upload(_client("owner"))
    assert resp.status_code == 502
    assert db.updates == []
