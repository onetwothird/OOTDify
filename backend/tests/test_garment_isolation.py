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
