"""Gemini (Google AI Studio key): one JSON-reply call shared by Ask Penggi and
garment vision.

When GEMINI_API_KEY is set, those features use Gemini instead of Claude (see
`use_gemini`). Errors are mapped to three kinds the callers turn into their own
honest failures; nothing here invents a reply.
"""
from __future__ import annotations

import logging
from typing import Optional, Union

from config import Config

logger = logging.getLogger(__name__)

# A part is plain text or (mime_type, bytes) for an image.
Part = Union[str, tuple[str, bytes]]

# Statuses that mean "busy, try again": retried once, then the fallback model.
OVERLOADED = (500, 503, 504)

BLOCKED_FINISH ={"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT"}


class GeminiBlocked(RuntimeError):
    """Gemini's safety filters declined the request or the reply."""


class GeminiRateLimited(RuntimeError):
    """Gemini answered 429 (quota or rate limit)."""


class GeminiFailed(RuntimeError):
    """Any other failure: network, server, empty reply."""


def use_gemini() -> bool:
    return bool(Config.GEMINI_API_KEY)


def generate_json(
    *,
    turns: list[tuple[str, list[Part]]],
    system: Optional[str] = None,
    schema: Optional[dict] = None,
    timeout_s: float = 25.0,
    max_tokens: int = 2048,
) -> str:
    """Send `turns` ([(role, parts)], role "user" | "model"); return the JSON text."""
    from google import genai  # imported lazily: only needed when the feature is on
    from google.genai import errors, types

    client = genai.Client(
        api_key=Config.GEMINI_API_KEY,
        http_options=types.HttpOptions(
            timeout=int(timeout_s * 1000),
            # Overload blips are common; one quick retry before the fallback model.
            retry_options=types.HttpRetryOptions(
                attempts=2, initial_delay=1.0, max_delay=3.0, http_status_codes=list(OVERLOADED)
            ),
        ),
    )
    contents = [
        types.Content(
            role=role,
            parts=[
                types.Part.from_text(text=p) if isinstance(p, str) else types.Part.from_bytes(data=p[1], mime_type=p[0])
                for p in parts
            ],
        )
        for role, parts in turns
    ]
    config = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_json_schema=schema,
        max_output_tokens=max_tokens,
    )
    models = [Config.GEMINI_MODEL]
    if Config.GEMINI_FALLBACK_MODEL and Config.GEMINI_FALLBACK_MODEL != Config.GEMINI_MODEL:
        models.append(Config.GEMINI_FALLBACK_MODEL)
    for i, model in enumerate(models):
        try:
            response = client.models.generate_content(model=model, contents=contents, config=config)
            break
        except errors.APIError as exc:
            if exc.code in OVERLOADED and i + 1 < len(models):
                logger.warning("Gemini %s overloaded (status %s); trying %s", model, exc.code, models[i + 1])
                continue
            if exc.code == 429:
                logger.warning("Gemini rate limited")
                raise GeminiRateLimited(str(exc)) from exc
            logger.exception("Gemini request failed (status %s)", exc.code)
            raise GeminiFailed(str(exc)) from exc
        except Exception as exc:
            logger.exception("Gemini request failed")
            raise GeminiFailed(str(exc)) from exc

    feedback = getattr(response, "prompt_feedback", None)
    if feedback is not None and getattr(feedback, "block_reason", None):
        raise GeminiBlocked(str(feedback.block_reason))
    candidates = response.candidates or []
    finish = getattr(candidates[0].finish_reason, "name", "") if candidates and candidates[0].finish_reason else ""
    if finish in BLOCKED_FINISH:
        raise GeminiBlocked(finish)
    text = response.text
    if not text:
        logger.error("Gemini returned no text (finish_reason=%s)", finish or "unknown")
        raise GeminiFailed("Gemini returned no text.")
    return text
