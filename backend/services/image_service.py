"""Image helpers: safe upload handling, validation and cleanup.

Kept separate from the YOLO service so that future image work (thumbnails,
Cloudinary upload, segmentation preprocessing, ...) has one home.
"""
from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Iterable, Optional

from PIL import Image, UnidentifiedImageError
from werkzeug.utils import secure_filename
from werkzeug.datastructures import FileStorage

logger = logging.getLogger(__name__)

# Extensions we accept (config mirrors this; kept here for standalone reuse)
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}


def has_allowed_extension(filename: str, allowed: Iterable[str] = ALLOWED_EXTENSIONS) -> bool:
    """Return True when the file extension is in the allowed set."""
    if not filename or "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    return ext in allowed


def is_valid_image(path: str | Path) -> bool:
    """Best-effort validation: the file is a real, decodable image."""
    try:
        with Image.open(path) as img:
            img.verify()  # checks the header/structure, then re-open to be safe
        with Image.open(path) as img:
            img.load()
        return True
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        logger.warning("Rejected non-image file %s: %s", path, exc)
        return False


def save_upload(
    file_storage: FileStorage,
    upload_dir: str | Path,
    allowed_extensions: Iterable[str] = ALLOWED_EXTENSIONS,
    max_bytes: Optional[int] = None,
) -> Path:
    """Save an uploaded file with a safe, collision-free filename.

    - `secure_filename` strips path separators / traversal attempts.
    - A random UUID prefix avoids collisions between users.
    - The extension is re-derived from the *validated* original so the API
      never trusts an arbitrary extension.

    Returns the absolute path of the saved file.
    """
    folder = Path(upload_dir)
    folder.mkdir(parents=True, exist_ok=True)

    original_name = file_storage.filename or "upload"
    safe_name = secure_filename(original_name)

    if safe_name and "." in safe_name:
        ext = safe_name.rsplit(".", 1)[1].lower()
    else:  # no safe extension → default to jpg
        ext = "jpg"

    if ext not in allowed_extensions:
        raise ValueError(f"File type '.{ext}' is not allowed")

    unique_name = f"{uuid.uuid4().hex}_{safe_name or 'image'}"
    target = folder / unique_name

    file_storage.save(target)

    if max_bytes is not None and target.stat().st_size > max_bytes:
        cleanup(target)
        raise ValueError(
            f"File is too large (max {max_bytes // (1024 * 1024)} MB)."
        )

    logger.info("Saved upload: %s", target)
    return target


def cleanup(*paths: str | Path) -> None:
    """Delete files best-effort (used for temporary uploads)."""
    for path in paths:
        try:
            Path(path).unlink(missing_ok=True)
        except Exception as exc:  # never crash the request on cleanup failure
            logger.warning("Cleanup failed for %s: %s", path, exc)  


def ingest_upload(file_storage, upload_dir, max_bytes=None, allowed_extensions=ALLOWED_EXTENSIONS) -> Path:
    """Validate + store an uploaded image in one call.

    Raises ValueError with a user-friendly message on any problem (wrong
    extension, not a real image, too large). The caller is responsible for
    deleting the returned file after processing (see `cleanup`).
    """
    if not file_storage or not file_storage.filename:
        raise ValueError("Empty filename.")

    if not has_allowed_extension(file_storage.filename, allowed_extensions):
        raise ValueError("Unsupported file type. Allowed: png, jpg, jpeg, webp.")

    saved_path = save_upload(
        file_storage,
        upload_dir,
        allowed_extensions=allowed_extensions,
        max_bytes=max_bytes,
    )

    if not is_valid_image(saved_path):
        cleanup(saved_path)
        raise ValueError("File is not a valid image.")

    return saved_path


def save_annotated_plot(results, output_dir: str | Path, stem: str) -> str:
    """Save `results[0].plot()` (BGR numpy) as a JPEG in output_dir.

    Used by every AI service (detection / pose / segmentation) that can render
    an annotated preview of its inference. Returns the saved filename.

    Args:
        results: Ultralytics Results list (first element is plotted).
        output_dir: destination folder (created if missing).
        stem: base filename stem, e.g. the uploaded file's stem.
    """
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    bgr_array = results[0].plot()  # annotated image, BGR channel order
    filename = f"{stem}_annotated.jpg"
    target = out_dir / filename

    # Convert BGR -> RGB and save with Pillow
    rgb_array = bgr_array[..., ::-1]
    Image.fromarray(rgb_array).save(target, quality=90)
    logger.info("Saved annotated image: %s", target)
    return filename