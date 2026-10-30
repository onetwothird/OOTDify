"""HTTP tests for POST /api/stylist/chat ("Ask Penggi").

Only the stylist blueprint is mounted. The closet read and the Claude call are
faked; auth is seeded on flask.g and consent patched.
"""
from collections import defaultdict, deque

import pytest
from flask import Flask, g

from routes import stylist
from services import ratelimit
from services.stylist_chat import StylistNotConfiguredError, StylistRefusedError

CLOSET = [
    {"id": "a1", "name": "Denim jacket", "category": "Outerwear", "color": ["blue"], "style": "Casual", "occasion": []},
    {"id": "b2", "name": "White tee", "category": "Tops", "color": ["white"], "style": None, "occasion": ["Casual"]},
]


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr("services.consent.has_required_consent", lambda user: True)
    monkeypatch.setattr(ratelimit, "_events", defaultdict(deque))
    state = {"seen": {}, "answer": {"reply": "Wear the Denim jacket over the White tee.", "piece_ids": ["a1", "b2"]}}

    def fake_closet(user_id, limit=0):
        state["seen"]["closet_user"] = user_id
        return CLOSET

    def fake_chat(history, closet, profile, context):
        state["seen"]["history"] = history
        state["seen"]["context"] = context
        state["seen"]["closet"] = closet
        if isinstance(state["answer"], Exception):
            raise state["answer"]
        return state["answer"]

    monkeypatch.setattr(stylist, "load_closet_candidates", fake_closet)
    monkeypatch.setattr(stylist, "ensure_profile", lambda user_id: {"preferred_styles": ["Minimal"]})
    monkeypatch.setattr(stylist, "get_stylist", lambda: fake_chat)

    app = Flask(__name__)
    app.register_blueprint(stylist.stylist_bp)

    @app.before_request
    def _fake_user():
        g.current_user = {"id": "user-1", "email": None, "user_metadata": {}}

    state["client"] = app.test_client()
    return state


def post(env, body):
    return env["client"].post("/api/stylist/chat", json=body)


def test_replies_with_pieces_from_my_own_closet(env):
    resp = post(env, {"messages": [{"role": "user", "text": "What should I wear today?"}], "context": {"language": "en"}})
    body = resp.get_json()
    assert resp.status_code == 200, body
    assert body == {"success": True, "reply": "Wear the Denim jacket over the White tee.", "piece_ids": ["a1", "b2"]}
    # Identity comes from the session, never the request.
    assert env["seen"]["closet_user"] == "user-1"
    assert [(t.role, t.text) for t in env["seen"]["history"]] == [("user", "What should I wear today?")]


def test_passes_filipino_language_and_place(env):
    post(env, {"messages": [{"role": "user", "text": "Ano isusuot ko?"}], "context": {"language": "fil", "place": "Quezon City", "local_time": "08:30"}})
    assert env["seen"]["context"] == {"language": "fil", "place": "Quezon City", "local_time": "08:30"}


def test_rejects_a_conversation_that_does_not_end_with_the_user(env):
    resp = post(env, {"messages": [{"role": "assistant", "text": "Hi!"}]})
    assert resp.status_code == 400


def test_rejects_empty_or_oversized_messages(env):
    assert post(env, {"messages": []}).status_code == 400
    assert post(env, {"messages": [{"role": "user", "text": "   "}]}).status_code == 400
    assert post(env, {"messages": [{"role": "user", "text": "x" * 1001}]}).status_code == 400
    assert post(env, {"messages": [{"role": "robot", "text": "hi"}]}).status_code == 400


def test_keeps_only_the_recent_turns(env):
    turns = []
    for i in range(30):
        turns.append({"role": "user", "text": f"q{i}"})
        turns.append({"role": "assistant", "text": f"a{i}"})
    turns.append({"role": "user", "text": "last"})
    assert post(env, {"messages": turns}).status_code == 200
    history = env["seen"]["history"]
    assert len(history) <= stylist.MAX_TURNS
    assert history[0].role == "user" and history[-1].text == "last"


def test_says_so_when_not_configured(env):
    env["answer"] = StylistNotConfiguredError("no key")
    resp = post(env, {"messages": [{"role": "user", "text": "hi"}]})
    assert resp.status_code == 503
    assert resp.get_json()["code"] == "not_configured"


def test_says_so_when_penggi_declines(env):
    env["answer"] = StylistRefusedError("refused")
    resp = post(env, {"messages": [{"role": "user", "text": "hi"}]})
    assert resp.status_code == 422
    assert resp.get_json()["code"] == "refused"


def test_unknown_language_falls_back_to_english(env):
    post(env, {"messages": [{"role": "user", "text": "hi"}], "context": {"language": "xx"}})
    assert env["seen"]["context"]["language"] == "en"
