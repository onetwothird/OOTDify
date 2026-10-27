"""HTTP tests for the bio field on PATCH /api/profile.

Only the users blueprint is mounted. Auth is satisfied by pre-seeding flask.g
the way require_user caches it; Supabase is replaced by a recorder so the test
sees exactly what would be written.
"""
from collections import defaultdict, deque

import pytest
from flask import Flask, g

from routes import users
from services import ratelimit


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
    return recorder


@pytest.fixture
def client(db):
    app = Flask(__name__)
    app.register_blueprint(users.users_bp)

    @app.before_request
    def _fake_user():
        g.current_user = {"id": "user-1", "email": None, "user_metadata": {}}

    return app.test_client()


def test_saves_a_trimmed_bio(client, db):
    resp = client.patch("/api/profile", json={"bio": "  Thrifted denim, mostly.  "})
    assert resp.status_code == 200, resp.get_json()
    assert db.updates[-1]["bio"] == "Thrifted denim, mostly."
    assert resp.get_json()["profile"]["bio"] == "Thrifted denim, mostly."


def test_blank_bio_clears_it(client, db):
    resp = client.patch("/api/profile", json={"bio": "   "})
    assert resp.status_code == 200
    assert db.updates[-1]["bio"] is None


def test_rejects_a_bio_over_the_limit(client, db):
    resp = client.patch("/api/profile", json={"bio": "x" * (users.BIO_MAX_LENGTH + 1)})
    assert resp.status_code == 400
    assert db.updates == []


def test_rejects_a_non_text_bio(client, db):
    resp = client.patch("/api/profile", json={"bio": 42})
    assert resp.status_code == 400
    assert db.updates == []
