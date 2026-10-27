"""Cloudinary media hosting (server-side only).

Avatars and profile cover photos are hosted here; the other image categories
still live in Supabase Storage. Existing Supabase avatar
refs keep rendering — the app's `resolveMediaUrl()` passes the HTTPS URLs we
store for Cloudinary objects straight through, so both sources coexist.

Privacy rules:
  * Credentials come from backend/.env and never reach the Expo bundle.
  * Public ids are server-generated: `<folder>/<category>/<uid>/<uuid4>`. The
    uid prefix lets account deletion remove everything by prefix; the random
    uuid keeps URLs unguessable.
  * When Cloudinary is not configured we raise `CloudinaryNotConfiguredError`
    instead of silently falling back — the caller surfaces an honest error.
"""
from __future__ import annotations

import logging
import uuid
from pathlib import Path

import cloudinary
import cloudinary.api
import cloudinary.uploader

from config import Config

logger = logging.getLogger(__name__)

_configured = False


class CloudinaryNotConfiguredError(RuntimeError):
    """Raised when the CLOUDINARY_* env vars are missing."""


class CloudinaryError(RuntimeError):
    """Raised on any Cloudinary upload/delete failure."""


def is_configured() -> bool:
    return bool(
        Config.CLOUDINARY_CLOUD_NAME
        and Config.CLOUDINARY_API_KEY
        and Config.CLOUDINARY_API_SECRET
    )


def _ensure_configured() -> None:
    global _configured
    if not is_configured():
        raise CloudinaryNotConfiguredError(
            "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, "
            "CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in backend/.env."
        )
    if not _configured:
        cloudinary.config(
            cloud_name=Config.CLOUDINARY_CLOUD_NAME,
            api_key=Config.CLOUDINARY_API_KEY,
            api_secret=Config.CLOUDINARY_API_SECRET,
            secure=True,
        )
        _configured = True


def verify_credentials() -> str | None:
    """Ask Cloudinary whether it accepts the configured keys.

    Returns None when it does, otherwise why not (with the API secret
    scrubbed). `is_configured()` only checks the variables are set;
    this is the live check for when uploads fail.
    """
    try:
        _ensure_configured()
        cloudinary.api.ping()
        return None
    except CloudinaryNotConfiguredError:
        return "Cloudinary is not configured."
    except Exception as exc:
        reason = str(exc) or type(exc).__name__
        if Config.CLOUDINARY_API_SECRET:
            reason = reason.replace(Config.CLOUDINARY_API_SECRET, "***")
        return reason


# Every per-user category; account deletion removes each by prefix.
_CATEGORIES = ("avatars", "covers")


def _user_prefix(category: str, user_id: str) -> str:
    return f"{Config.CLOUDINARY_FOLDER}/{category}/{user_id}"


def _upload(category: str, user_id: str, local_path: str | Path, width: int, height: int) -> str:
    _ensure_configured()
    public_id = f"{_user_prefix(category, user_id)}/{uuid.uuid4().hex}"
    try:
        result = cloudinary.uploader.upload(
            str(local_path),
            public_id=public_id,
            resource_type="image",
            overwrite=False,
            # Normalise on ingest: never store more pixels than the app shows.
            transformation=[{"width": width, "height": height, "crop": "limit"}],
        )
    except Exception as exc:
        logger.exception("Cloudinary %s upload failed", category)
        raise CloudinaryError(f"Could not upload image: {exc}") from exc

    url = result.get("secure_url")
    if not url:
        raise CloudinaryError("Cloudinary returned no URL for the uploaded image.")
    logger.info("Uploaded %s for user %s -> %s", category, user_id, public_id)
    return url


def upload_avatar(user_id: str, local_path: str | Path) -> str:
    """Upload a validated local image as the user's avatar; returns its HTTPS URL."""
    # Square-ish avatars never need more than 512px.
    return _upload("avatars", user_id, local_path, 512, 512)


def upload_cover(user_id: str, local_path: str | Path) -> str:
    """Upload a validated local image as the user's profile cover; returns its HTTPS URL."""
    # A full-width banner: 1600px wide covers every phone and tablet.
    return _upload("covers", user_id, local_path, 1600, 900)


def delete_user_media(user_id: str) -> None:
    """Delete every Cloudinary object owned by the user (account deletion).

    A no-op when Cloudinary is not configured: nothing can have been uploaded.
    """
    if not is_configured():
        return
    _ensure_configured()
    for category in _CATEGORIES:
        prefix = _user_prefix(category, user_id) + "/"
        try:
            cloudinary.api.delete_resources_by_prefix(prefix, resource_type="image")
            logger.info("Deleted Cloudinary media under %s", prefix)
        except Exception as exc:
            logger.exception("Cloudinary delete failed for %s", prefix)
            raise CloudinaryError(f"Could not delete media: {exc}") from exc
