"""Garment isolation: cut the main clothing item away from its background.

Classical CV (OpenCV GrabCut), not a learned clothing model — the bundled
YOLO weights are COCO-trained and have no garment classes, so they cannot
tell a shirt from a bedsheet. GrabCut separates the dominant foreground
object from the background, which fits the capture flow: one garment laid
flat or hung up, roughly centred in the frame.

It does NOT classify the garment (the user still picks the category) and it
cannot reliably pick one item out of several. Every result carries an
honest `ok` flag + `reason`; when the cut-out is not trustworthy the caller
keeps the user's original photo rather than saving a bad crop.

PRIVACY: works on the temporary upload only; nothing is persisted here.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

# Longest side GrabCut runs at (speed); the output is cut from the full image.
WORK_SIZE = 640
# Rectangle inset used to seed GrabCut: the border is assumed background.
RECT_MARGIN = 0.04
GRABCUT_ITERATIONS = 5

# Foreground share of the frame outside which the result is not trusted.
MIN_COVERAGE = 0.05
MAX_COVERAGE = 0.90
# The largest connected blob must hold this share of all foreground pixels;
# below it the photo most likely shows several separate objects.
MIN_DOMINANCE = 0.75

OUTPUT_PADDING = 0.04
OUTPUT_MAX_SIDE = 1280


@dataclass
class IsolationResult:
    ok: bool
    reason: Optional[str] = None
    coverage: Optional[float] = None
    dominance: Optional[float] = None
    jpeg: Optional[bytes] = None
    width: Optional[int] = None
    height: Optional[int] = None

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "reason": self.reason,
            "coverage": self.coverage,
            "dominance": self.dominance,
            "width": self.width,
            "height": self.height,
        }


def _load_rgb(image_path: str | Path) -> np.ndarray:
    with Image.open(image_path) as img:
        # Respect camera orientation so the mask lines up with what the user saw.
        upright = ImageOps.exif_transpose(img).convert("RGB")
        return np.asarray(upright)


def _foreground_mask(rgb: np.ndarray) -> np.ndarray:
    """Binary uint8 mask (1 = foreground) at the image's own resolution."""
    h, w = rgb.shape[:2]
    scale = min(1.0, WORK_SIZE / max(h, w))
    small = cv2.resize(rgb, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
    sh, sw = small.shape[:2]

    mx, my = max(1, int(sw * RECT_MARGIN)), max(1, int(sh * RECT_MARGIN))
    rect = (mx, my, sw - 2 * mx, sh - 2 * my)
    mask = np.zeros((sh, sw), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    bgr = cv2.cvtColor(small, cv2.COLOR_RGB2BGR)
    cv2.grabCut(bgr, mask, rect, bgd, fgd, GRABCUT_ITERATIONS, cv2.GC_INIT_WITH_RECT)

    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, kernel)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, kernel)
    return cv2.resize(fg, (w, h), interpolation=cv2.INTER_NEAREST)


def _largest_component(mask: np.ndarray) -> tuple[np.ndarray, float]:
    """Keep only the largest blob; returns (mask, its share of all foreground)."""
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count <= 1:
        return mask, 0.0
    areas = stats[1:, cv2.CC_STAT_AREA]
    biggest = int(np.argmax(areas)) + 1
    dominance = float(areas.max() / areas.sum())
    largest = (labels == biggest).astype(np.uint8)
    # Fill holes inside the garment (prints/logos GrabCut marked as background).
    contours, _ = cv2.findContours(largest, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(largest)
    cv2.drawContours(filled, contours, -1, 1, thickness=cv2.FILLED)
    return filled, dominance


def _compose(rgb: np.ndarray, mask: np.ndarray) -> tuple[bytes, int, int]:
    """Garment on a white background, cropped to the mask with padding, as JPEG."""
    ys, xs = np.nonzero(mask)
    h, w = mask.shape
    pad = int(max(h, w) * OUTPUT_PADDING)
    y0, y1 = max(0, ys.min() - pad), min(h, ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(w, xs.max() + pad + 1)

    # Soft edge so the cut-out does not look jagged.
    alpha = cv2.GaussianBlur(mask.astype(np.float32), (5, 5), 0)[..., None]
    white = np.full_like(rgb, 255)
    out = (rgb * alpha + white * (1 - alpha)).astype(np.uint8)[y0:y1, x0:x1]

    img = Image.fromarray(out)
    img.thumbnail((OUTPUT_MAX_SIDE, OUTPUT_MAX_SIDE))
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue(), img.width, img.height


def isolate_garment(image_path: str | Path) -> IsolationResult:
    try:
        rgb = _load_rgb(image_path)
        raw = _foreground_mask(rgb)
    except Exception:
        logger.exception("Garment isolation failed")
        return IsolationResult(ok=False, reason="processing_failed")

    total = raw.size
    coverage = round(float(raw.sum()) / total, 4)
    if coverage < MIN_COVERAGE:
        return IsolationResult(ok=False, reason="no_object", coverage=coverage)
    if coverage > MAX_COVERAGE:
        return IsolationResult(ok=False, reason="fills_frame", coverage=coverage)

    mask, dominance = _largest_component(raw)
    dominance = round(dominance, 4)
    if dominance < MIN_DOMINANCE:
        return IsolationResult(ok=False, reason="multiple_objects", coverage=coverage, dominance=dominance)

    jpeg, width, height = _compose(rgb, mask)
    return IsolationResult(
        ok=True,
        coverage=round(float(mask.sum()) / total, 4),
        dominance=dominance,
        jpeg=jpeg,
        width=width,
        height=height,
    )
