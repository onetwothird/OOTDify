"""Ask Penggi routes.

POST /api/stylist/chat → Penggi's reply to the latest message, plus the ids of
the caller's own closet pieces he suggested. Body:

    {"messages": [{"role": "user"|"assistant", "text": "..."}, ...],
     "context": {"language": "en"|"fil", "place": "...", "local_time": "HH:MM"}}

The closet and preferences are read server-side for the session's user. Only
the most recent turns are sent on, and the conversation is not stored.
"""
from __future__ import annotations

import logging
import re

from flask import Blueprint, jsonify, request

from config import Config
from routes.users import ensure_profile
from services.auth_service import require_auth, require_user
from services.catalog_service import load_closet_candidates
from services.consent import require_consent
from services.ratelimit import rate_limit
from services.stylist_chat import (
    LANGUAGES,
    ChatTurn,
    StylistError,
    StylistNotConfiguredError,
    StylistRefusedError,
    get_stylist,
)

logger = logging.getLogger(__name__)

stylist_bp = Blueprint("stylist", __name__)

# Enough for a real back-and-forth; older turns are dropped (always from the
# front, so the conversation still starts with the user).
MAX_TURNS = 20
MAX_TEXT = 1000
CLOSET_LIMIT = 200
_TIME = re.compile(r"^\d{1,2}:\d{2}$")


class _BadRequest(ValueError):
    pass


def _history(raw) -> list[ChatTurn]:
    if not isinstance(raw, list) or not raw:
        raise _BadRequest("Send at least one message.")
    turns: list[ChatTurn] = []
    for item in raw:
        if not isinstance(item, dict) or item.get("role") not in ("user", "assistant"):
            raise _BadRequest("Each message needs a role of user or assistant.")
        text = str(item.get("text") or "").strip()
        if not text:
            raise _BadRequest("Messages cannot be empty.")
        if len(text) > MAX_TEXT:
            raise _BadRequest(f"Keep each message under {MAX_TEXT} characters.")
        turns.append(ChatTurn(item["role"], text))
    if turns[-1].role != "user":
        raise _BadRequest("The last message must be from the user.")
    turns = turns[-MAX_TURNS:]
    while turns and turns[0].role != "user":
        turns = turns[1:]
    return turns


def _context(raw) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    language = raw.get("language")
    context = {"language": language if language in LANGUAGES else "en"}
    place = str(raw.get("place") or "").strip()[:80]
    if place:
        context["place"] = place
    local_time = str(raw.get("local_time") or "").strip()
    if _TIME.match(local_time):
        context["local_time"] = local_time
    return context


@stylist_bp.post("/api/stylist/chat")
@require_auth
@rate_limit(Config.RATE_LIMIT_STYLIST_MAX, Config.RATE_LIMIT_STYLIST_WINDOW, "stylist_chat")
@require_consent
def stylist_chat():
    user = require_user()
    payload = request.get_json(silent=True) or {}
    try:
        history = _history(payload.get("messages"))
    except _BadRequest as exc:
        return jsonify(success=False, error=str(exc)), 400
    context = _context(payload.get("context"))

    closet = load_closet_candidates(user["id"], limit=CLOSET_LIMIT)
    profile = ensure_profile(user["id"])
    try:
        answer = get_stylist()(history, closet, profile, context)
    except StylistNotConfiguredError:
        return jsonify(success=False, code="not_configured", error="Ask Penggi is not set up on the server yet."), 503
    except StylistRefusedError:
        return jsonify(success=False, code="refused", error="Penggi can't help with that one."), 422
    except StylistError as exc:
        return jsonify(success=False, code="unavailable", error=str(exc)), 502

    logger.info("Ask Penggi answered user %s (%d turn(s), %d piece(s))", user["id"], len(history), len(answer["piece_ids"]))
    return jsonify(success=True, reply=answer["reply"], piece_ids=answer["piece_ids"])
