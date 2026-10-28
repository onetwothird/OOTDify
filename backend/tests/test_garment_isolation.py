"""Tests for services/garment_isolation.py on synthetic images (no model weights)."""
from io import BytesIO

import numpy as np
from PIL import Image, ImageDraw

from services.garment_isolation import isolate_garment


def _save(img: Image.Image, tmp_path, name="photo.jpg"):
    path = tmp_path / name
    img.save(path, quality=95)
    return path


def _garment_on_floor(size=(480, 640)):
    """A dark 'shirt' shape centred on a light textured floor."""
    rng = np.random.default_rng(0)
    floor = (rng.normal(200, 6, (size[1], size[0], 3))).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(floor)
    draw = ImageDraw.Draw(img)
    w, h = size
    draw.rectangle([w * 0.3, h * 0.3, w * 0.7, h * 0.8], fill=(30, 40, 120))  # body
    draw.rectangle([w * 0.15, h * 0.3, w * 0.3, h * 0.45], fill=(30, 40, 120))  # left sleeve
    draw.rectangle([w * 0.7, h * 0.3, w * 0.85, h * 0.45], fill=(30, 40, 120))  # right sleeve
    return img


def test_isolates_single_garment(tmp_path):
    result = isolate_garment(_save(_garment_on_floor(), tmp_path))

    assert result.ok, result.reason
    assert 0.05 < result.coverage < 0.9
    out = Image.open(BytesIO(result.jpeg))
    assert out.format == "JPEG"
    # Cropped to the garment: smaller than the 480x640 input.
    assert out.width < 480 and out.height < 640
    # Background replaced with white: corners are near-white.
    corner = np.asarray(out.convert("RGB"))[0, 0]
    assert corner.min() > 235


def test_blank_photo_is_not_faked(tmp_path):
    blank = Image.new("RGB", (480, 640), (210, 210, 210))
    result = isolate_garment(_save(blank, tmp_path))

    assert not result.ok
    assert result.reason in {"no_object", "fills_frame"}
    assert result.jpeg is None


def test_two_separate_objects_are_flagged(tmp_path):
    img = Image.new("RGB", (640, 480), (220, 220, 220))
    draw = ImageDraw.Draw(img)
    draw.rectangle([60, 120, 260, 380], fill=(20, 20, 20))
    draw.rectangle([380, 120, 580, 380], fill=(150, 20, 20))
    result = isolate_garment(_save(img, tmp_path))

    assert not result.ok
    assert result.reason == "multiple_objects"


def test_unreadable_file_reports_failure(tmp_path):
    path = tmp_path / "broken.jpg"
    path.write_bytes(b"not an image")
    result = isolate_garment(path)

    assert not result.ok
    assert result.reason == "processing_failed"


# --------------------------------------------------------------------------
# Worn garments: a clothes-parsing model separates clothes from the body.
# A fake parser stands in for the model so no weights are needed.
# --------------------------------------------------------------------------
from services.clothes_parser import (  # noqa: E402
    ARM_LEFT,
    ARM_RIGHT,
    BACKGROUND,
    FACE,
    PANTS,
    UPPER_CLOTHES,
)


def _person_photo(size=(480, 640)):
    img = Image.new("RGB", size, (200, 205, 210))
    draw = ImageDraw.Draw(img)
    w, h = size
    draw.ellipse([w * 0.35, 0, w * 0.65, h * 0.23], fill=(210, 160, 130))  # head
    draw.rectangle([w * 0.25, h * 0.25, w * 0.75, h * 0.62], fill=(30, 40, 120))  # shirt
    draw.rectangle([0, h * 0.25, w * 0.25, h * 0.55], fill=(210, 160, 130))  # left arm
    draw.rectangle([w * 0.75, h * 0.25, w, h * 0.55], fill=(210, 160, 130))  # right arm
    draw.rectangle([w * 0.3, h * 0.62, w * 0.7, h * 0.81], fill=(60, 60, 60))  # trousers
    return img


def _labels(size=(480, 640), body=True, clothes=True):
    w, h = size
    labels = np.full((h, w), BACKGROUND, np.uint8)
    if body:
        labels[0 : int(h * 0.23), int(w * 0.35) : int(w * 0.65)] = FACE
        labels[int(h * 0.25) : int(h * 0.55), 0 : int(w * 0.25)] = ARM_LEFT
        labels[int(h * 0.25) : int(h * 0.55), int(w * 0.75) :] = ARM_RIGHT
    if clothes:
        labels[int(h * 0.25) : int(h * 0.62), int(w * 0.25) : int(w * 0.75)] = UPPER_CLOTHES
        labels[int(h * 0.62) : int(h * 0.81), int(w * 0.3) : int(w * 0.7)] = PANTS
    return labels


def test_worn_garment_keeps_the_clothes_and_drops_the_body(tmp_path):
    result = isolate_garment(_save(_person_photo(), tmp_path), parser=lambda rgb: _labels())

    assert result.ok, result.reason
    out = Image.open(BytesIO(result.jpeg))
    # The head (top 23%) and the arms (outer 25% each side) are gone.
    assert out.height < 0.7 * 640
    assert out.width < 0.65 * 480


def test_flat_lay_without_a_body_still_uses_the_plain_cutout(tmp_path):
    flat = _save(_garment_on_floor(), tmp_path)
    labels = _labels(body=False, clothes=True)
    result = isolate_garment(flat, parser=lambda rgb: labels)

    assert result.ok, result.reason


def test_a_body_with_no_clothes_is_not_faked(tmp_path):
    result = isolate_garment(
        _save(_person_photo(), tmp_path), parser=lambda rgb: _labels(body=True, clothes=False)
    )

    assert not result.ok
    assert result.reason == "no_object"
    assert result.jpeg is None
