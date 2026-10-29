"""HTTP tests for POST /api/tryon/realistic/token.

Only the realistic blueprint is mounted, so the real require_auth,
upload_limits and require_consent decorators run. Decart (requests.post) is
faked; auth is seeded on flask.g and consent patched.
"""
import logging
from collections import defaultdict, deque

import pytest
import requests
from flask import Flask, g

from config import Config
from routes import realistic
from services import ratelimit

KEY = "dk_secret_1234567890"
URL = "/api/tryon/realistic/token"


class FakeResponse:
    def __init__(self, status=200, payload=None, text=""):
        self.status_code = status
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr("services.consent.has_required_consent", lambda user: True)
    monkeypatch.setattr(ratelimit, "_events", defaultdict(deque))
    monkeypatch.setattr(Config, "DECART_API_KEY", KEY, raising=False)
    monkeypatch.setattr(Config, "DECART_MODEL", "lucy-vton-3.6", raising=False)
    monkeypatch.setattr(Config, "REALISTIC_SESSION_SECONDS", 60, raising=False)

    state = {"calls": [], "response": FakeResponse(200, {"apiKey": "ek_short", "expiresAt": "2026-10-29T10:00:00Z"})}

    def fake_post(url, **kwargs):
        state["calls"].append((url, kwargs))
        if isinstance(state["response"], Exception):
            raise state["response"]
        return state["response"]

    monkeypatch.setattr(realistic.requests, "post", fake_post)

    app = Flask(__name__)
    app.register_blueprint(realistic.realistic_bp)
    authed = {"on": True}

    @app.before_request
    def _fake_user():
        if authed["on"]:
            g.current_user = {"id": "user-1", "email": None, "user_metadata": {}}

    state["client"] = app.test_client()
    state["authed"] = authed
    return state


def test_token_request_shape(env):
    resp = env["client"].post(URL)
    assert resp.status_code == 200
    (url, kwargs), = env["calls"]
    assert url == "https://api.decart.ai/v1/client/tokens"
    assert kwargs["headers"]["x-api-key"] == KEY
    assert kwargs["json"] == {"expiresIn": 60, "allowedModels": ["lucy-vton-3.6"]}
    assert kwargs["timeout"] == 10


def test_token_returns_token_model_and_session_seconds(env):
    body = env["client"].post(URL).get_json()
    assert body == {
        "success": True,
        "token": {"apiKey": "ek_short", "expiresAt": "2026-10-29T10:00:00Z"},
        "model": "lucy-vton-3.6",
        "session_seconds": 60,
    }


def test_no_key_is_503_not_configured(env, monkeypatch):
    monkeypatch.setattr(Config, "DECART_API_KEY", "")
    resp = env["client"].post(URL)
    assert resp.status_code == 503
    assert resp.get_json() == {"success": False, "error": "not_configured"}
    assert env["calls"] == []


@pytest.mark.parametrize(
    "outcome",
    [FakeResponse(401, {"error": "bad"}), FakeResponse(429, {"error": "slow"}), requests.Timeout("t")],
    ids=["401", "429", "timeout"],
)
def test_decart_401_429_timeout_become_502(env, outcome):
    env["response"] = outcome
    resp = env["client"].post(URL)
    assert resp.status_code == 502
    assert resp.get_json() == {"success": False, "error": "provider_error"}


@pytest.mark.parametrize(
    "response",
    [
        FakeResponse(500, {"apiKey": "x", "expiresAt": "y"}),
        FakeResponse(200, None),
        FakeResponse(200, ["apiKey"]),
        FakeResponse(200, {"apiKey": "x"}),
        FakeResponse(200, {"apiKey": 5, "expiresAt": "y"}),
        FakeResponse(200, {"apiKey": "", "expiresAt": "y"}),
    ],
)
def test_unexpected_shapes_are_provider_error(env, response):
    env["response"] = response
    resp = env["client"].post(URL)
    assert resp.status_code == 502
    assert resp.get_json() == {"success": False, "error": "provider_error"}


def test_only_api_key_and_expires_at_are_forwarded(env):
    env["response"] = FakeResponse(200, {"apiKey": "ek", "expiresAt": "t", "extra": "leak"})
    body = env["client"].post(URL).get_json()
    assert body["token"] == {"apiKey": "ek", "expiresAt": "t"}


def test_key_never_in_response_or_logs(env, caplog):
    caplog.set_level(logging.DEBUG)
    env["response"] = FakeResponse(401, {"error": f"invalid key {KEY}"}, text=f"invalid key {KEY}")
    resp = env["client"].post(URL)
    assert resp.status_code == 502
    assert KEY not in resp.get_data(as_text=True)
    assert KEY not in caplog.text
    assert "invalid key" not in caplog.text

    env["response"] = requests.ConnectionError(f"failed with {KEY}")
    resp = env["client"].post(URL)
    assert KEY not in resp.get_data(as_text=True)
    assert KEY not in caplog.text


def test_token_requires_auth(env):
    env["authed"]["on"] = False
    resp = env["client"].post(URL)
    assert resp.status_code == 401
    assert env["calls"] == []
