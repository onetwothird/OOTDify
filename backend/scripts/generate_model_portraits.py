"""Make the six preset model portraits once, with Gemini's image model.

Each preset (services/gemini_tryon.py PRESET_MODELS) is a made-up person; this
draws them as a 3:4 studio portrait so the app's model cards show a real-looking
face, and saves the same picture where the backend sends it as the face
reference for that model's try-ons. The people are AI-generated, and the app
labels every result "AI model".

Needs a Gemini key on a billing-enabled project (the free tier has no image
quota). Run from backend/:

    .venv/Scripts/python scripts/generate_model_portraits.py          # missing ones
    .venv/Scripts/python scripts/generate_model_portraits.py --force  # redo all
    .venv/Scripts/python scripts/generate_model_portraits.py ava leo  # just these

Writes backend/assets/models/<id>.jpg (sent to Gemini) and
assets/images/models/<id>.jpg (the app's cards, 600px). After a run, update
src/features/tryon/presetPhotos.ts so the app picks them up.
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")

from PIL import Image  # noqa: E402

from services import gemini_client  # noqa: E402
from services.gemini_tryon import PORTRAIT_DIR, PRESET_MODELS  # noqa: E402

APP_DIR = BACKEND.parent / "assets" / "images" / "models"

PROMPT = (
    "A photorealistic fashion-agency comp-card portrait of {who}. Three-quarter length, from the "
    "top of the head to mid-thigh, facing the camera with a relaxed, friendly expression. "
    "Plain fitted heather-grey t-shirt and simple dark trousers, no logos or jewellery. "
    "Seamless pale grey-blue studio backdrop, soft directional light, 85mm lens look, sharp focus, "
    "true-to-life skin texture. One person only. No text, watermark or border."
)


def main(argv: list[str]) -> int:
    force = "--force" in argv
    wanted = [a for a in argv if not a.startswith("--")] or list(PRESET_MODELS)
    unknown = [w for w in wanted if w not in PRESET_MODELS]
    if unknown:
        print(f"Unknown preset(s): {', '.join(unknown)}")
        return 2
    PORTRAIT_DIR.mkdir(parents=True, exist_ok=True)
    APP_DIR.mkdir(parents=True, exist_ok=True)

    failed = 0
    for key in wanted:
        target = PORTRAIT_DIR / f"{key}.jpg"
        if target.exists() and not force:
            print(f"{key}: already there, skipped (use --force to redo)")
            continue
        try:
            data = gemini_client.generate_image([PROMPT.format(who=PRESET_MODELS[key])], timeout_s=120)
        except (gemini_client.GeminiBlocked, gemini_client.GeminiRateLimited, gemini_client.GeminiFailed) as exc:
            print(f"{key}: failed: {exc}")
            failed += 1
            continue
        with Image.open(io.BytesIO(data)) as img:
            img = img.convert("RGB")
            img.save(target, format="JPEG", quality=92)
            small = img.copy()
            small.thumbnail((600, 800))
            small.save(APP_DIR / f"{key}.jpg", format="JPEG", quality=86)
        print(f"{key}: saved")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
