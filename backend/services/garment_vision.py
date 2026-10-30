"""Garment vision: name and locate the clothing item in a capture photo.

A photo of a person wearing a t-shirt should add *the t-shirt*, not the person.
GrabCut (see garment_isolation.py) cannot do that, so this asks a vision model to point
at the main garment and describe it; the caller crops to the returned box.

Provider: Gemini when GEMINI_API_KEY is set (services/gemini_client.py),
otherwise Claude.

Privacy: the photo is sent to Google or Anthropic for this one request and
nothing is stored here. Callers must already have passed auth + consent. When no API key is
configured we raise `GarmentVisionNotConfiguredError` and the capture flow falls
back to the plain cut-out, never to invented output.
"""
from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Optional

from PIL import Image, ImageOps

from config import Config
from services import gemini_client

logger = logging.getLogger(__name__)

CATEGORIES = ("Tops", "Bottoms", "Outerwear", "Dresses", "Shoes", "Accessories")
SEND_MAX_SIDE = 1024

PROMPT = (
    "You are cataloguing a clothing photo for a personal closet app. The photo may "
    "show a person wearing the clothes, a flat-lay, or a hanger. Pick the single most "
    "prominent garment (for a person: the main top if visible, otherwise the main "
    "item). Reply with ONLY a JSON object, no prose, with these keys:\n"
    '  "found": boolean - false if no clothing item is clearly visible,\n'
    f'  "category": one of {list(CATEGORIES)},\n'
    '  "name": short item name, e.g. "Navy crew-neck t-shirt",\n'
    '  "color": main colour in plain words,\n'
    '  "pattern": e.g. "solid", "striped", "graphic print",\n'
    '  "fit": e.g. "relaxed", "slim", "oversized", or "unknown",\n'
    '  "description": one or two plain sentences describing only this garment '
    "(fabric look, neckline, sleeves, details). Never describe the person,\n"
    '  "box": {"x": number, "y": number, "w": number, "h": number} - a tight box '
    "around that garment only, as fractions 0..1 of the image width/height, "
    "origin top-left."
)


class GarmentVisionNotConfiguredError(RuntimeError):
    """Raised when neither GEMINI_API_KEY nor ANTHROPIC_API_KEY is set."""


class GarmentVisionError(RuntimeError):
    """Raised when the vision request fails or returns something unusable."""


@dataclass
class GarmentDescription:
    found: bool
    category: Optional[str] = None
    name: Optional[str] = None
    color: Optional[str] = None
    pattern: Optional[str] = None
    fit: Optional[str] = None
    description: Optional[str] = None
    box: Optional[tuple[float, float, float, float]] = None  # x, y, w, h (0..1)

    def to_dict(self) -> dict:
        return {
            "found": self.found,
            "category": self.category,
            "name": self.name,
            "color": self.color,
            "pattern": self.pattern,
            "fit": self.fit,
            "description": self.description,
        }


def is_configured() -> bool:
    return gemini_client.use_gemini() or bool(Config.ANTHROPIC_API_KEY)


def _encode(image_path: str | Path) -> str:
    with Image.open(image_path) as raw:
        img = ImageOps.exif_transpose(raw).convert("RGB")
    img.thumbnail((SEND_MAX_SIDE, SEND_MAX_SIDE))
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _text(value, limit: int = 300) -> Optional[str]:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value[:limit] or None


def _clean_box(raw) -> Optional[tuple[float, float, float, float]]:
    """A usable box is four numbers inside the frame with real area."""
    if not isinstance(raw, dict):
        return None
    try:
        x, y, w, h = (float(raw[k]) for k in ("x", "y", "w", "h"))
    except (KeyError, TypeError, ValueError):
        return None
    x, y = max(0.0, min(1.0, x)), max(0.0, min(1.0, y))
    w, h = min(w, 1.0 - x), min(h, 1.0 - y)
    if w < 0.05 or h < 0.05:
        return None
    return (x, y, w, h)


def parse_reply(text: str) -> GarmentDescription:
    """Turn the model's reply into a GarmentDescription (raises on junk)."""
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise GarmentVisionError("The vision reply contained no JSON.")
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise GarmentVisionError("The vision reply was not valid JSON.") from exc
    if not isinstance(data, dict):
        raise GarmentVisionError("The vision reply had an unexpected shape.")

    box = _clean_box(data.get("box"))
    if data.get("found") is not True or box is None:
        return GarmentDescription(found=False)
    category = data.get("category")
    return GarmentDescription(
        found=True,
        category=category if category in CATEGORIES else None,
        name=_text(data.get("name"), 80),
        color=_text(data.get("color"), 40),
        pattern=_text(data.get("pattern"), 40),
        fit=_text(data.get("fit"), 40),
        description=_text(data.get("description"), 400),
        box=box,
    )


def describe_garment(image_path: str | Path) -> GarmentDescription:
    if not is_configured():
        raise GarmentVisionNotConfiguredError(
            "Garment description is not configured. Set GEMINI_API_KEY or ANTHROPIC_API_KEY in backend/.env."
        )
    if gemini_client.use_gemini():
        try:
            text = gemini_client.generate_json(
                turns=[("user", [("image/jpeg", base64.b64decode(_encode(image_path))), PROMPT])],
                timeout_s=20.0,
                max_tokens=1024,
            )
        except gemini_client.GeminiBlocked as exc:
            raise GarmentVisionError("The vision model declined this photo.") from exc
        except (gemini_client.GeminiRateLimited, gemini_client.GeminiFailed) as exc:
            raise GarmentVisionError(f"Vision request failed: {exc}") from exc
        return parse_reply(text)
    import anthropic  # imported lazily: only needed when the feature is on

    client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY, timeout=45.0)
    try:
        response = client.messages.create(
            model=Config.GARMENT_VISION_MODEL,
            max_tokens=1024,
            output_config={"effort": "low"},
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": _encode(image_path),
                            },
                        },
                        {"type": "text", "text": PROMPT},
                    ],
                }
            ],
        )
    except Exception as exc:
        logger.exception("Garment vision request failed")
        raise GarmentVisionError(f"Vision request failed: {exc}") from exc

    if response.stop_reason == "refusal":
        raise GarmentVisionError("The vision model declined this photo.")
    text = "".join(b.text for b in response.content if b.type == "text")
    return parse_reply(text)


def crop_to_box(
    image_path: str | Path,
    box: tuple[float, float, float, float],
    padding: float = 0.06,
) -> bytes:
    """Crop the (EXIF-corrected) photo to `box` plus a little padding; JPEG bytes."""
    with Image.open(image_path) as raw:
        img = ImageOps.exif_transpose(raw).convert("RGB")
    width, height = img.size
    x, y, w, h = box
    left = max(0, int((x - padding * w) * width))
    top = max(0, int((y - padding * h) * height))
    right = min(width, int((x + w + padding * w) * width))
    bottom = min(height, int((y + h + padding * h) * height))
    buf = BytesIO()
    img.crop((left, top, right, bottom)).save(buf, format="JPEG", quality=90)
    return buf.getvalue()
