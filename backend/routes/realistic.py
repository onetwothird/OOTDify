"""Realistic-mode token route.

POST /api/tryon/realistic/token → a short-lived Decart client token.

The app opens the live "Go realistic" session straight with Decart using this
token, so the long-lived DECART_API_KEY never leaves the server. The key and
Decart's response text are never logged or returned; only `apiKey` and
`expiresAt` are read from Decart's JSON.
"""
from __future__ import annotations

import logging

import requests
from flask import Blueprint, jsonify

from config import Config
from services.auth_service import require_auth
from services.consent import require_consent
from services.ratelimit import upload_limits

logger = logging.getLogger(__name__)

realistic_bp = Blueprint("realistic", __name__)

DECART_TOKEN_URL = "https://api.decart.ai/v1/client/tokens"
DECART_TIMEOUT_SECONDS = 10
# The token itself always lives 60 s; session_seconds is the app-side session length.
TOKEN_EXPIRES_IN = 60


def _provider_error():
    return jsonify(success=False, error="provider_error"), 502


@realistic_bp.post("/api/tryon/realistic/token")
@require_auth
@upload_limits("realistic_token")
@require_consent
def realistic_token():
    api_key = (Config.DECART_API_KEY or "").strip()
    if not api_key:
        return jsonify(success=False, error="not_configured"), 503

    seconds = Config.REALISTIC_SESSION_SECONDS
    model = Config.DECART_MODEL
    try:
        resp = requests.post(
            DECART_TOKEN_URL,
            headers={"x-api-key": api_key},
            json={"expiresIn": TOKEN_EXPIRES_IN, "allowedModels": [model]},
            timeout=DECART_TIMEOUT_SECONDS,
        )
    except Exception as exc:  # noqa: BLE001 - any failure must not leak the key
        # Class name only: exception text could echo the key or request details.
        logger.warning("Decart token request failed (%s)", type(exc).__name__)
        return _provider_error()

    if resp.status_code != 200:
        logger.warning("Decart token request returned HTTP %s", resp.status_code)
        return _provider_error()

    try:
        data = resp.json()
    except ValueError:
        logger.warning("Decart token response was not JSON")
        return _provider_error()

    token = data.get("apiKey") if isinstance(data, dict) else None
    expires = data.get("expiresAt") if isinstance(data, dict) else None
    if not (isinstance(token, str) and token and isinstance(expires, str) and expires):
        logger.warning("Decart token response had an unexpected shape")
        return _provider_error()

    return jsonify(
        success=True,
        token={"apiKey": token, "expiresAt": expires},
        model=model,
        session_seconds=seconds,
    )
