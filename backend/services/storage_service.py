"""Private storage access via Supabase Storage (service role).

Privacy rules enforced here:
  * Every user-owned object lives under `users/<uid>/`, `wardrobe/<uid>/`,
    `tryons/<uid>/` or `avatars/<uid>/` — never under a shared/shared-public
    prefix, so cross-user enumeration is impossible.
  * Objects are only ever handed to the app as SHORT-LIVED SIGNED URLs
    (default 15 minutes, configurable via SIGNED_URL_EXPIRY_SECONDS). The
    buckets themselves are private in Supabase (see supabase/schema.sql).
  * File names are never user-supplied; the server generates secure UUID names.

Storage paths are stored in the DB as `bucket/<uid>/<uuid>.<ext>` strings so
rows are unambiguous and account deletion can enumerate + remove everything.
"""
from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Iterable, List, Optional

from config import Config
from services.supabase_client import SupabaseNotConfiguredError, get_supabase

logger = logging.getLogger(__name__)

_DEFAULT_EXPIRY = 15 * 60  # seconds; overridden by Config in resolve()


class StorageError(RuntimeError):
    """Raised on any storage failure (upload/sign/delete)."""


def _split_path(storage_path: str) -> tuple[str, str]:
    """Split `bucket/uid/...` into (bucket, object_path)."""
    parts = storage_path.split("/", 1)
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise StorageError(f"Invalid storage path: {storage_path!r}")
    return parts[0], parts[1]


def _new_object_path(bucket: str, user_id: str, extension: str = "jpg") -> str:
    """Generate a collision-free object path with a secure random name."""
    safe_ext = (extension or "jpg").lower().lstrip(".")
    if safe_ext not in {"jpg", "jpeg", "png", "webp"}:
        safe_ext = "jpg"
    return f"{bucket}/{user_id}/{uuid.uuid4().hex}.{safe_ext}"


def upload_file(bucket: str, user_id: str, local_path: str | Path, content_type: str | None = None) -> str:
    """Upload a local (temporary) file into the user's private folder.

    Returns the full storage path (bucket/uid/uuid.ext) to store in the DB.
    """
    local = Path(local_path)
    if not local.is_file():
        raise StorageError(f"Source file does not exist: {local_path}")

    ext = local.suffix.lstrip(".") or "jpg"
    storage_path = _new_object_path(bucket, user_id, ext)
    bucket_name, object_path = _split_path(storage_path)
    mime = content_type or {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }.get(ext, "application/octet-stream")

    try:
        get_supabase().storage.from_(bucket_name).upload(
            object_path,
            local.read_bytes(),
            {"content-type": mime},
        )
    except Exception as exc:
        logger.exception("Storage upload failed")
        raise StorageError(f"Could not store file: {exc}") from exc

    logger.info("Uploaded %s -> %s", local.name, storage_path)
    return storage_path


def upload_bytes(
    bucket: str,
    user_id: str,
    data: bytes,
    extension: str = "jpg",
    content_type: str | None = None,
) -> str:
    """Upload raw bytes into the user's private folder; returns storage path."""
    storage_path = _new_object_path(bucket, user_id, extension)
    bucket_name, object_path = _split_path(storage_path)
    mime = content_type or {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }.get(extension.lower().lstrip("."), "application/octet-stream")

    try:
        get_supabase().storage.from_(bucket_name).upload(
            object_path,
            data,
            {"content-type": mime},
        )
    except Exception as exc:
        logger.exception("Storage upload (bytes) failed")
        raise StorageError(f"Could not store file: {exc}") from exc

    logger.info("Uploaded %d bytes -> %s", len(data), storage_path)
    return storage_path


def signed_url(storage_path: str, expiry_seconds: Optional[int] = None) -> str:
    """Return a short-lived signed URL for a private object."""
    if expiry_seconds is None:
        expiry_seconds = _DEFAULT_EXPIRY
    bucket_name, object_path = _split_path(storage_path)
    try:
        response = get_supabase().storage.from_(bucket_name).create_signed_url(
            object_path, expiry_seconds
        )
        url = response.get("signedURL") if isinstance(response, dict) else getattr(response, "signedURL", None)
    except Exception as exc:
        logger.exception("Signed URL generation failed")
        raise StorageError(f"Could not sign URL: {exc}") from exc
    if not url:
        raise StorageError(f"Signed URL generation returned nothing for {storage_path!r}")
    return url


def delete_objects(storage_paths: Iterable[str]) -> None:
    """Delete objects best-effort (used for user deletion / row deletion)."""
    for storage_path in storage_paths:
        try:
            bucket_name, object_path = _split_path(storage_path)
            get_supabase().storage.from_(bucket_name).remove([object_path])
        except Exception as exc:
            logger.warning("Failed to delete storage object %s: %s", storage_path, exc)


def _list_folder(bucket_name: str, folder_prefix: str) -> List[str]:
    """Return all object paths under `folder_prefix` (paginated)."""
    all_objects: List[str] = []
    offset = 0
    page = 100
    while True:
        try:
            items = get_supabase().storage.from_(bucket_name).list(
                folder_prefix,
                {"limit": page, "offset": offset},
            )
        except Exception as exc:
            logger.warning("Failed to list %s/%s: %s", bucket_name, folder_prefix, exc)
            break
        names = [item["name"] for item in items if isinstance(item, dict) and item.get("name")]
        if not names:
            break
        # A returned "name" may be a nested folder; include it as a path.
        all_objects.extend(f"{folder_prefix}{name}" for name in names)
        if len(names) < page:
            break
        offset += page
    return all_objects


def delete_user_storage(user_id: str) -> None:
    """Delete every private object owned by the user across all buckets.

    Called during account deletion. Rows in the DB cascade via
    auth.users on delete cascade; storage objects must be removed explicitly.
    """
    for bucket_name in Config.PRIVATE_BUCKETS:
        prefix = f"{user_id}/"
        try:
            objects = _list_folder(bucket_name, prefix)
        except SupabaseNotConfiguredError:
            raise
        if not objects:
            continue
        try:
            get_supabase().storage.from_(bucket_name).remove(objects)
            logger.info("Deleted %d object(s) in %s for user %s", len(objects), bucket_name, user_id)
        except Exception as exc:
            logger.warning("Failed to delete %d objects in %s: %s", len(objects), bucket_name, exc)