"""Supabase service-role client (backend only).

This is the ONLY module that holds the service-role key at runtime. It must
never be imported by the Expo app. All user-data access from Flask goes
through this client, which bypasses RLS *by design* (the Flask backend is the
trusted server) — every route that uses it MUST first authenticate the caller
via auth_service.require_user() and then scope queries to that user id.

The client is created lazily and cached for the lifetime of the process.
"""
from __future__ import annotations

import logging
import threading
from typing import Optional

from supabase import Client, create_client

from config import Config

logger = logging.getLogger(__name__)

_client: Optional[Client] = None
_lock = threading.Lock()


class SupabaseNotConfiguredError(RuntimeError):
    """Raised when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing."""


def is_configured() -> bool:
    return bool(Config.SUPABASE_URL and Config.SUPABASE_SERVICE_ROLE_KEY)


def get_supabase() -> Client:
    """Return the cached service-role client, or raise if not configured."""
    global _client
    if _client is not None:
        return _client
    with _lock:
        if _client is None:
            if not is_configured():
                raise SupabaseNotConfiguredError(
                    "Supabase is not configured. Set SUPABASE_URL and "
                    "SUPABASE_SERVICE_ROLE_KEY in backend/.env "
                    "(backend/.env.example has the template)."
                )
            logger.info("Creating Supabase service-role client for %s", Config.SUPABASE_URL)
            _client = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)
    return _client