"""Ask Penggi: a stylist chat over the caller's own closet, answered by an LLM.

The app sends the recent conversation plus light context (app language, the
place shown on Home, local time). The closet and style preferences are read
server-side for the session's user, never taken from the request. Penggi may
only suggest pieces that are in that closet and names them by id, so the app
can show the real photos; ids that are not in the closet are dropped.

Language: Penggi answers in the language the user writes in (English,
Filipino, or a Taglish mix), falling back to the app's language.

Provider: Gemini when GEMINI_API_KEY is set (services/gemini_client.py),
otherwise Claude.

Privacy: the conversation and a text summary of the closet (names, categories,
colours; no photos) go to Google or Anthropic for this request only; nothing is
stored here. Callers must already have passed auth + consent. Without an API key
the caller gets `StylistNotConfiguredError`, never an invented reply.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Callable, Optional

from config import Config
from services import gemini_client

logger = logging.getLogger(__name__)

LANGUAGES = {"en": "English", "fil": "Filipino"}

PERSONA = (
    "You are Penggi, the friendly penguin stylist inside OOTDify, a personal closet app. "
    "You help the user decide what to wear using ONLY the pieces in their closet listed below. "
    "Each piece is shown as [id] name, with its category, colour, style and occasions.\n\n"
    "How to answer:\n"
    "- Be warm, upbeat and brief: at most about 120 words, short sentences, no headings or "
    "markdown tables. A short list of pieces is fine.\n"
    "- When you suggest a piece, use its exact name from the closet and put its id in piece_ids. "
    "Never invent pieces. If the closet lacks something the look needs, say what kind of piece "
    "would help instead of pretending they own it.\n"
    "- Use the weather you can reasonably infer from the place and time only as a gentle hint; "
    "you do not have a live forecast, so do not state temperatures.\n"
    "- Answer in the language the user writes in: English, Filipino (Tagalog), or a natural "
    "Taglish mix. If unsure, use the app language given in the context.\n"
    "- Stay on clothes, outfits, styling, colours, occasions and using OOTDify. Politely steer "
    "anything else back to styling.\n"
    "- Reply as JSON with `reply` (what Penggi says) and `piece_ids` (ids of closet pieces you "
    "mentioned, in the order mentioned; empty if none)."
)

REPLY_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "piece_ids": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["reply", "piece_ids"],
    "additionalProperties": False,
}


class StylistNotConfiguredError(RuntimeError):
    """Raised when neither GEMINI_API_KEY nor ANTHROPIC_API_KEY is set."""


class StylistRefusedError(RuntimeError):
    """Raised when the model declines to answer (stop_reason "refusal")."""


class StylistError(RuntimeError):
    """Raised when the request fails or returns something unusable."""


@dataclass(frozen=True)
class ChatTurn:
    role: str  # "user" | "assistant"
    text: str

    def as_message(self) -> dict:
        return {"role": self.role, "content": self.text}


def _piece_line(piece: dict) -> str:
    details = [
        piece.get("category"),
        ", ".join(piece.get("color") or []) or None,
        piece.get("style"),
        ("for " + ", ".join(piece["occasion"])) if piece.get("occasion") else None,
    ]
    extra = "; ".join(d for d in details if d)
    return f"[{piece['id']}] {piece.get('name') or 'Item'}" + (f" ({extra})" if extra else "")


def build_system_prompt(closet: list[dict], profile: dict) -> str:
    """Persona + the closet + saved preferences. Stable per closet, so it caches."""
    prefs = []
    for label, key in (
        ("Preferred styles", "preferred_styles"),
        ("Preferred colours", "preferred_colors"),
        ("Usual occasions", "preferred_occasions"),
        ("Sizes", "sizes"),
    ):
        values = profile.get(key) or []
        if values:
            prefs.append(f"{label}: {', '.join(values)}")
    closet_text = "\n".join(_piece_line(p) for p in closet) if closet else "(The closet is empty.)"
    prefs_text = "\n".join(prefs) if prefs else "(No saved preferences.)"
    return f"{PERSONA}\n\nUser's saved preferences:\n{prefs_text}\n\nUser's closet:\n{closet_text}"


def context_block(context: dict) -> str:
    """This turn's context: changes every request, so it rides with the last message."""
    parts = [f"App language: {LANGUAGES.get(context.get('language', 'en'), 'English')}"]
    if context.get("place"):
        parts.append(f"Place: {context['place']}")
    if context.get("local_time"):
        parts.append(f"Local time: {context['local_time']}")
    return "[Context] " + " | ".join(parts)


def keep_known_pieces(piece_ids: list, closet: list[dict]) -> list[str]:
    """Only ids that are really in this closet, each once, in order."""
    known = {str(p["id"]) for p in closet}
    out: list[str] = []
    for pid in piece_ids:
        pid = str(pid)
        if pid in known and pid not in out:
            out.append(pid)
    return out


def is_configured() -> bool:
    return gemini_client.use_gemini() or bool(Config.ANTHROPIC_API_KEY)


def chat(history: list[ChatTurn], closet: list[dict], profile: dict, context: dict) -> dict:
    if not is_configured():
        raise StylistNotConfiguredError(
            "Ask Penggi is not configured. Set GEMINI_API_KEY or ANTHROPIC_API_KEY in backend/.env."
        )
    if gemini_client.use_gemini():
        text = _ask_gemini(history, closet, profile, context)
    else:
        text = _ask_claude(history, closet, profile, context)
    try:
        data = json.loads(text)
        reply = str(data["reply"]).strip()
        piece_ids = list(data.get("piece_ids") or [])
    except (ValueError, KeyError, TypeError) as exc:
        logger.error("Ask Penggi returned unusable output")
        raise StylistError("Penggi could not answer right now.") from exc
    if not reply:
        raise StylistError("Penggi could not answer right now.")
    return {"reply": reply, "piece_ids": keep_known_pieces(piece_ids, closet)}


def _ask_gemini(history: list[ChatTurn], closet: list[dict], profile: dict, context: dict) -> str:
    turns: list[tuple[str, list]] = [
        ("model" if turn.role == "assistant" else "user", [turn.text]) for turn in history
    ]
    turns[-1] = ("user", [context_block(context), history[-1].text])
    schema = {k: v for k, v in REPLY_SCHEMA.items() if k != "additionalProperties"}
    try:
        return gemini_client.generate_json(
            turns=turns, system=build_system_prompt(closet, profile), schema=schema, max_tokens=2048,
            quick=True, timeout_s=15.0,
        )
    except gemini_client.GeminiBlocked as exc:
        raise StylistRefusedError("Penggi can't help with that one.") from exc
    except gemini_client.GeminiRateLimited as exc:
        raise StylistError("Penggi is busy right now. Try again in a moment.") from exc
    except gemini_client.GeminiFailed as exc:
        raise StylistError("Penggi could not answer right now.") from exc


def _ask_claude(history: list[ChatTurn], closet: list[dict], profile: dict, context: dict) -> str:
    import anthropic  # imported lazily: only needed when the feature is on

    messages = [turn.as_message() for turn in history]
    # The volatile context goes in the last user turn, after the cached prefix.
    messages[-1] = {
        "role": "user",
        "content": [
            {"type": "text", "text": context_block(context)},
            {"type": "text", "text": history[-1].text},
        ],
    }

    client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY, timeout=60.0)
    try:
        response = client.beta.messages.create(
            model=Config.STYLIST_CHAT_MODEL,
            max_tokens=4096,
            # Chat: quick and light. Thinking stays adaptive (always on for this model).
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": REPLY_SCHEMA}},
            # No server-side fallback: Haiku 5.5 has none, so a decline is a refusal below.
            cache_control={"type": "ephemeral"},
            system=build_system_prompt(closet, profile),
            messages=messages,
        )
    except anthropic.RateLimitError as exc:
        logger.warning("Ask Penggi rate limited by Anthropic")
        raise StylistError("Penggi is busy right now. Try again in a moment.") from exc
    except anthropic.APIStatusError as exc:
        logger.exception("Ask Penggi request failed (status %s)", exc.status_code)
        raise StylistError("Penggi could not answer right now.") from exc
    except anthropic.APIConnectionError as exc:
        logger.exception("Ask Penggi could not reach Anthropic")
        raise StylistError("Penggi could not answer right now.") from exc

    if response.stop_reason == "refusal":
        raise StylistRefusedError("Penggi can't help with that one.")
    return next((b.text for b in response.content if b.type == "text"), "")


Stylist = Callable[[list[ChatTurn], list[dict], dict, dict], dict]


def get_stylist() -> Stylist:
    """The chat function; tests replace this getter."""
    return chat
