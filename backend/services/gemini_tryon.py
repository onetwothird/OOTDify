"""Photo try-on with Gemini's image model.

Takes the garments of an outfit and a "wearer", and asks Gemini to draw that
wearer in exactly those garments. The wearer is one of:

  * the user's own whole-body photo: their pose and setting are kept;
  * the user's face-only photo: the AI creates the body, and the app says so;
  * a preset model: a described person, no photo of anyone is sent.

Errors become TryOnError with text that is safe to show; nothing here ever
produces a placeholder picture.
"""
from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Iterable, Optional

from PIL import Image

from services import gemini_client
from services.tryon_service import GENERIC_ERROR, TryOnError, VTONProvider

logger = logging.getLogger(__name__)

BLOCKED_ERROR = "This photo can't be used for try-on. Try a different one."
BUSY_ERROR = "The AI is busy right now. Try again in a minute."
QUOTA_ERROR = "Try-on has used up its AI allowance for now. Try again later."

# Each preset's portrait (made once by scripts/generate_model_portraits.py, the
# same picture the app shows on the model's card). When present it is sent as
# the face reference, so the person in the try-on is the one the user picked.
PORTRAIT_DIR = Path(__file__).resolve().parent.parent / "assets" / "models"


def preset_portrait(preset: Optional[str]) -> Optional[Path]:
    if not is_preset(preset):
        return None
    path = PORTRAIT_DIR / f"{preset}.jpg"
    return path if path.is_file() else None


def _quota_exhausted(exc: Exception) -> bool:
    """A daily or zero quota (e.g. a free-tier key), not a short burst."""
    text = str(exc)
    return "PerDay" in text or "limit: 0" in text

# Described, made-up people the user can dress instead of themselves. The keys
# are the app's preset ids (src/features/tryon/presets.ts); keep them in sync.
PRESET_MODELS: dict[str, str] = {
    "ava": "a Filipina woman in her mid-20s, petite build, shoulder-length straight black hair, warm light-brown skin",
    "leo": "a Filipino man in his late 20s, average build, short black hair, warm tan skin",
    "mia": "a woman in her early 30s, curvy build, long wavy dark-brown hair, medium olive skin",
    "kai": "a tall athletic man in his mid-20s, short curly black hair, deep brown skin",
    "rin": "an East Asian woman in her 20s, tall and slim, chin-length black bob, fair skin",
    "sam": "an androgynous person in their 20s, slim build, short tousled ash-brown hair, light skin",
}

# Pose keypoints that show the lower body. Seeing a hip and a knee with real
# confidence means the photo shows enough of the body to keep.
LOWER_BODY = {"left_hip", "right_hip", "left_knee", "right_knee"}
KEYPOINT_CONFIDENCE = 0.5


def is_preset(key: Optional[str]) -> bool:
    return bool(key) and key in PRESET_MODELS


def photo_kind(pose: Optional[dict]) -> str:
    """"whole_body" when a hip and a knee are confidently visible, else "face_only"."""
    seen = {
        kp.get("name")
        for kp in (pose or {}).get("keypoints") or []
        if (kp.get("confidence") or 0) >= KEYPOINT_CONFIDENCE
    }
    hip = bool(seen & {"left_hip", "right_hip"})
    knee = bool(seen & {"left_knee", "right_knee"})
    return "whole_body" if hip and knee else "face_only"


def _colors(value) -> str:
    if isinstance(value, (list, tuple)):
        names = [str(v) for v in value if v]
        return " and ".join(names)
    return str(value or "")


def garment_label(index: int, row: dict) -> str:
    """'Garment 2 — bottom: wide-leg jeans, light blue.' from a clothing row."""
    category = (row.get("category") or "").strip()
    details = [d for d in ((row.get("name") or "").strip(), _colors(row.get("color")).strip()) if d]
    if not category and not details:
        return f"Garment {index} — clothing item."
    head = f"Garment {index} — {category or 'clothing'}"
    return f"{head}: {', '.join(details)}." if details else f"{head}."


def _jpeg(path: str) -> bytes:
    """Any stored image as an RGB JPEG (cutouts are PNG with alpha: put on white)."""
    with Image.open(path) as img:
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
            canvas = Image.new("RGB", img.size, (255, 255, 255))
            canvas.paste(img, mask=img.split()[-1])
            img = canvas
        else:
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=92)
        return buf.getvalue()


ROLE = (
    "You are a fashion photographer and retoucher making a product-accurate lookbook photo. "
    "Each garment photo above shows one real product the customer owns or wants to buy."
)
ACCURACY = (
    "Reproduce every garment exactly as photographed: the same color shade, fabric and texture, "
    "pattern and its scale, print and logo placement, any text, buttons, zips, collar, neckline, "
    "sleeve length, hem length and silhouette. Do not redesign, recolor, simplify or swap any garment. "
    "Use all of the garments above and nothing else; do not add or drop any clothing item "
    "(plain matching socks are fine). If a garment photo shows a person, mannequin or hanger, take only "
    "the garment from it. Make each piece drape and fit naturally on the body, with real creases and "
    "weight, worn the way it is meant to be worn."
)
LOOK = (
    "Make it a photorealistic full-length fashion lookbook photo, 3:4 portrait: the whole person "
    "from head to toe with a little room above the head and below the feet, a relaxed, confident "
    "standing pose that shows the outfit clearly, soft directional studio light with a gentle "
    "floor shadow, an 85mm lens look, crisp focus on the fabric, true-to-life skin and hands. "
    "No text, logos added by you, watermarks, borders or collage."
)
STUDIO = "a seamless pale grey-blue studio backdrop"


def build_instructions(kind: str, preset: Optional[str] = None) -> str:
    if kind == "preset" and preset:
        wearer = (
            f"Photograph {PRESET_MODELS[preset]}, a professional fashion model, standing in front of "
            f"{STUDIO}, wearing these garments."
        )
    elif kind == "face_only":
        wearer = (
            "Create a natural full-body photo of the person in the first photo wearing these garments, "
            f"in front of {STUDIO}. Keep their face, identity, skin tone and hair exactly; give them a "
            "natural body that matches their face and build."
        )
    else:
        wearer = (
            "Dress the person in the first photo in these garments. Keep their face, identity, skin tone, "
            "hair, body shape, pose and background; light the clothes to match the photo."
        )
    return " ".join((ROLE, wearer, ACCURACY, LOOK if kind != "whole_body" else LOOK.split(": the whole")[0] + "."))


class GeminiTryOnProvider(VTONProvider):
    """VTONProvider backed by Gemini's image model."""

    def __init__(self) -> None:
        super().__init__("")

    def is_configured(self) -> bool:
        return gemini_client.use_gemini()

    def generate(self, inputs: dict) -> Path:
        kind = inputs.get("photo_kind") or "whole_body"
        preset = inputs.get("model_preset")
        parts: list = []
        if kind != "preset":
            parts.append("Photo of the person to dress:")
            parts.append(("image/jpeg", _jpeg(inputs["person_image_path"])))
        else:
            portrait = preset_portrait(preset)
            if portrait:
                parts.append("Portrait of the model to photograph (keep this exact face, hair and skin tone):")
                parts.append(("image/jpeg", _jpeg(str(portrait))))
        labels: Iterable[str] = inputs.get("garment_labels") or []
        for label, path in zip(labels, inputs["clothing_image_paths"]):
            parts.append(label)
            parts.append(("image/jpeg", _jpeg(path)))
        parts.append(build_instructions(kind, preset))

        try:
            data = gemini_client.generate_image(parts)
        except gemini_client.GeminiBlocked as exc:
            raise TryOnError(BLOCKED_ERROR) from exc
        except gemini_client.GeminiRateLimited as exc:
            raise TryOnError(QUOTA_ERROR if _quota_exhausted(exc) else BUSY_ERROR) from exc
        except gemini_client.GeminiFailed as exc:
            raise TryOnError(GENERIC_ERROR) from exc

        try:
            with Image.open(io.BytesIO(data)) as img:
                out = Path(inputs["output_dir"]) / "tryon_result.jpg"
                img.convert("RGB").save(out, format="JPEG", quality=92)
        except Exception as exc:
            logger.error("Gemini try-on reply was not a readable image")
            raise TryOnError(GENERIC_ERROR) from exc
        return out
