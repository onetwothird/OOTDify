"""Terms/privacy consent enforcement (Phase 7).

The accepted terms version is stored in the Supabase Auth user's
``user_metadata`` (``terms_version`` + ``terms_accepted_at``) — written by the
client at sign-up (email and Google) or via the in-app consent screen, and read
server-side from the *validated* token in ``require_user``. Processing routes
(AI analysis, pose, segmentation, recommendations, try-on, body-photo storage)
wrap themselves in ``require_consent`` so a direct API request without a
recorded acceptance is rejected with 403 ``consent_required``.

Honest limitation (documented, not papered over): Supabase lets an account
owner edit their own ``user_metadata``, so this is a *recorded self-attestation*
— it guarantees no AI processing happens without an acceptance on file, but it
cannot cryptographically distinguish an acceptance made in our UI from one
written directly against the Auth API. Making the record tamper-proof would
require a backend-only table; the metadata approach avoids DDL on the live DB.

Keep REQUIRED_TERMS_VERSION in sync with the client constant in
``src/shared/config/legal.ts`` — both are intentionally duplicated because the
client must not be able to influence the version the backend enforces.
"""
from __future__ import annotations

import logging
from functools import wraps
from typing import Callable, Mapping, Optional

from flask import jsonify

from services.auth_service import AuthError, require_user
from services.supabase_client import SupabaseNotConfiguredError

logger = logging.getLogger(__name__)

#: The terms version every AI-processing endpoint requires to be on file.
REQUIRED_TERMS_VERSION = "2026-10-18"

#: user_metadata key holding the accepted terms version.
TERMS_VERSION_KEY = "terms_version"
#: user_metadata key holding the ISO-8601 acceptance timestamp.
TERMS_ACCEPTED_AT_KEY = "terms_accepted_at"


def consent_version(user: Optional[Mapping]) -> Optional[str]:
    """Return the terms version recorded on the user, or None."""
    if not isinstance(user, Mapping):
        return None
    metadata = user.get("user_metadata") or {}
    if not isinstance(metadata, Mapping):
        return None
    version = metadata.get(TERMS_VERSION_KEY)
    return str(version) if version else None


def has_required_consent(user: Optional[Mapping]) -> bool:
    """True when the user's metadata records the currently required version."""
    return consent_version(user) == REQUIRED_TERMS_VERSION


def require_consent(func: Callable) -> Callable:
    """Decorator: 403 consent_required unless the required terms are on file.

    Requires ``require_auth`` to be applied to the same route (it validates the
    token first); it also works standalone, in which case a missing/invalid
    token still yields 401.
    """

    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            user = require_user()
        except AuthError as exc:
            return jsonify(success=False, error=exc.message), 401
        except SupabaseNotConfiguredError:
            return (
                jsonify(
                    success=False,
                    error="Server is not configured (missing Supabase credentials).",
                ),
                503,
            )

        if not has_required_consent(user):
            logger.info("Rejected unconsented request to %s (user=%s)", func.__name__, user.get("id"))
            return (
                jsonify(
                    success=False,
                    error=(
                        "Please accept the Terms of Service and Privacy Policy "
                        "before using AI features."
                    ),
                    error_code="consent_required",
                    terms_version=REQUIRED_TERMS_VERSION,
                ),
                403,
            )
        return func(*args, **kwargs)

    return wrapper
