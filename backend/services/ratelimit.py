"""Lightweight in-memory rate limiting.

Per authenticated user (falling back to client IP for pre-auth endpoints),
per rule name. Sliding-window counters. Good enough for a dev/self-hosted
deployment; swap for Redis (e.g. limits) in production.

Never let rate limiting be the *only* upload guard — MAX_CONTENT_LENGTH and
image validation in image_service are enforced regardless.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict, deque
from functools import wraps
from typing import Callable, Deque, Dict

from flask import jsonify, request

from config import Config

logger = logging.getLogger(__name__)

# key -> deque of request timestamps
_events: Dict[str, Deque[float]] = defaultdict(deque)
_lock = threading.Lock()


class RateLimitExceeded(Exception):
    def __init__(self, retry_after: int) -> None:
        super().__init__("Too many requests.")
        self.retry_after = retry_after


def check_rate_limit(rule: str, max_requests: int, window_seconds: int, identity: str) -> None:
    """Record a hit; raise RateLimitExceeded when the window is exhausted."""
    key = f"{rule}:{identity}"
    now = time.monotonic()
    with _lock:
        dq = _events[key]
        while dq and now - dq[0] > window_seconds:
            dq.popleft()
        if len(dq) >= max_requests:
            raise RateLimitExceeded(retry_after=max(1, int(window_seconds - (now - dq[0]))))
        dq.append(now)


def _identity() -> str:
    """Best-effort identity: authenticated user id, else client IP."""
    from flask import g

    user = getattr(g, "current_user", None)
    return user["id"] if isinstance(user, dict) and user.get("id") else (request.remote_addr or "unknown")


def rate_limit(max_requests: int, window_seconds: int, rule: str) -> Callable:
    """Decorator that applies a sliding-window limit to a route."""

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                check_rate_limit(rule, max_requests, window_seconds, _identity())
            except RateLimitExceeded as exc:
                logger.warning("Rate limit hit on %s (%s)", rule, _identity())
                return (
                    jsonify(success=False, error="Too many requests. Please wait a moment and try again."),
                    429,
                    {"Retry-After": str(exc.retry_after)},
                )
            return func(*args, **kwargs)

        return wrapper

    return decorator


def default_limits(rule: str) -> Callable:
    """Rate limit using the DEFAULT_* settings (browsing / read endpoints)."""
    return rate_limit(Config.RATE_LIMIT_DEFAULT_MAX, Config.RATE_LIMIT_DEFAULT_WINDOW, rule)


def upload_limits(rule: str) -> Callable:
    """Strict limit for image uploads / processing endpoints (per hour)."""
    return rate_limit(Config.RATE_LIMIT_UPLOAD_MAX, Config.RATE_LIMIT_UPLOAD_WINDOW, rule)