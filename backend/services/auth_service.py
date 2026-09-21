"""Request authentication for the Flask API.

Every user-specific endpoint must resolve the caller's identity from the
validated Bearer token — never from a client-supplied user_id. Tokens are
validated against Supabase Auth (server side, via the service-role client),
so a stolen or expired token is rejected here.

Example:
    @users_bp.get("/api/profile")
    def profile():
        user = require_user()            # 401 if missing/invalid token
        uid = user["id"]
        ...
"""
from __future__ import annotations

import logging
from functools import wraps
from typing import Callable, Optional

from flask import g, jsonify, request

from services.supabase_client import SupabaseNotConfiguredError, get_supabase

logger = logging.getLogger(__name__)


class AuthError(Exception):
    """Raised when a request is unauthenticated; maps to HTTP 401."""

    def __init__(self, message: str = "Authentication required.") -> None:
        super().__init__(message)
        self.message = message


def _bearer_token() -> Optional[str]:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def require_user() -> dict:
    """Validate the Bearer token and return the authenticated Supabase user.

    The result is cached on flask.g for the duration of the request.
    Raises AuthError (-> 401) when the token is missing, invalid or expired.
    """
    if getattr(g, "current_user", None) is not None:
        return g.current_user

    token = _bearer_token()
    if not token:
        raise AuthError("Missing Authorization header.")

    try:
        auth_response = get_supabase().auth.get_user(token)
    except Exception as exc:  # invalid/expired token, network issue, etc.
        logger.warning("Token validation failed: %s", exc)
        raise AuthError("Invalid or expired session. Please sign in again.") from exc

    user = getattr(auth_response, "user", None)
    if user is None or not getattr(user, "id", None):
        raise AuthError("Invalid or expired session. Please sign in again.")

    g.current_user = {"id": user.id, "email": getattr(user, "email", None)}
    return g.current_user


def require_auth(func: Callable) -> Callable:
    """Decorator that turns AuthError into a clean 401 JSON response."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            require_user()
        except AuthError as exc:
            return jsonify(success=False, error=exc.message), 401
        except SupabaseNotConfiguredError as exc:
            logger.error("Supabase not configured: %s", exc)
            return (
                jsonify(success=False, error="Server is not configured (missing Supabase credentials)."),
                503,
            )
        return func(*args, **kwargs)

    return wrapper