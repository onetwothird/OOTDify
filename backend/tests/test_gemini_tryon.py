"""Tests for the Gemini photo try-on provider (services/gemini_tryon.py).

Gemini is faked: no network, no key needed beyond a test value.
"""
import io

import pytest
from PIL import Image

from services import gemini_client, gemini_tryon
from services.gemini_tryon import (
    BLOCKED_ERROR,
    BUSY_ERROR,
    QUOTA_ERROR,
    PRESET_MODELS,
    GeminiTryOnProvider,
    garment_label,
    photo_kind,
)
from services.tryon_service import GENERIC_ERROR, TryOnError


def _kp(name, conf=0.9):
    return {"name": name, "x": 10.0, "y": 10.0, "confidence": conf}


def _png_bytes(color=(200, 30, 30)):
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def images(tmp_path):
    person = tmp_path / "person.jpg"
    Image.new("RGB", (8, 8), (90, 90, 90)).save(person)
    shirt = tmp_path / "shirt.jpg"
    Image.new("RGB", (8, 8), (255, 255, 255)).save(shirt)
    return person, shirt


@pytest.fixture
def gemini_on(monkeypatch):
    monkeypatch.setattr("config.Config.GEMINI_API_KEY", "gemini-test-key")
    calls = []

    def install(result=None, error=None):
        def fake(parts, **kwargs):
            calls.append(parts)
            if error:
                raise error
            return result if result is not None else _png_bytes()

        monkeypatch.setattr(gemini_client, "generate_image", fake)
        return calls

    return install


class TestPhotoKind:
    def test_hips_and_knees_mean_whole_body(self):
        pose = {"keypoints": [_kp("nose"), _kp("left_hip"), _kp("right_knee")]}
        assert photo_kind(pose) == "whole_body"

    def test_face_alone_is_face_only(self):
        pose = {"keypoints": [_kp("nose"), _kp("left_eye"), _kp("right_eye")]}
        assert photo_kind(pose) == "face_only"

    def test_unsure_hips_do_not_count(self):
        pose = {"keypoints": [_kp("left_hip", 0.2), _kp("left_knee", 0.2)]}
        assert photo_kind(pose) == "face_only"

    def test_missing_pose_is_face_only(self):
        assert photo_kind(None) == "face_only"
        assert photo_kind({}) == "face_only"


class TestGarmentLabel:
    def test_uses_category_name_and_color(self):
        row = {"category": "bottom", "name": "Wide-leg jeans", "color": "light blue"}
        assert garment_label(2, row) == "Garment 2 — bottom: Wide-leg jeans, light blue."

    def test_catalog_colors_are_a_list(self):
        row = {"category": "top", "name": "Tee", "color": ["white", "navy"]}
        assert garment_label(1, row) == "Garment 1 — top: Tee, white and navy."

    def test_bare_row_still_has_a_label(self):
        assert garment_label(3, {}) == "Garment 3 — clothing item."


class TestProvider:
    def test_configured_follows_the_gemini_key(self, monkeypatch):
        monkeypatch.setattr("config.Config.GEMINI_API_KEY", "")
        assert not GeminiTryOnProvider().is_configured()
        monkeypatch.setattr("config.Config.GEMINI_API_KEY", "k")
        assert GeminiTryOnProvider().is_configured()

    def test_person_photo_goes_first_then_each_labelled_garment(self, gemini_on, images, tmp_path):
        calls = gemini_on()
        person, shirt = images
        out = GeminiTryOnProvider().generate(
            {
                "person_image_path": str(person),
                "photo_kind": "whole_body",
                "clothing_image_paths": [str(shirt)],
                "garment_labels": ["Garment 1 — top: Tee, white."],
                "output_dir": str(tmp_path),
            }
        )
        parts = calls[0]
        assert isinstance(parts[0], str) and "person" in parts[0].lower()
        assert parts[1][0] == "image/jpeg"
        assert parts[2] == "Garment 1 — top: Tee, white."
        assert parts[3][0] == "image/jpeg"
        assert "keep" in parts[-1].lower()
        # Saved as a real JPEG the pipeline can upload.
        assert out.is_file()
        assert Image.open(out).format == "JPEG"

    def test_face_only_asks_for_a_full_body(self, gemini_on, images, tmp_path):
        calls = gemini_on()
        person, shirt = images
        GeminiTryOnProvider().generate(
            {
                "person_image_path": str(person),
                "photo_kind": "face_only",
                "clothing_image_paths": [str(shirt)],
                "garment_labels": ["Garment 1 — top."],
                "output_dir": str(tmp_path),
            }
        )
        assert "full-body" in calls[0][-1].lower()

    def test_preset_model_sends_no_person_photo(self, gemini_on, images, tmp_path, monkeypatch):
        monkeypatch.setattr(gemini_tryon, "PORTRAIT_DIR", tmp_path / "no-portraits")
        calls = gemini_on()
        _, shirt = images
        preset = next(iter(PRESET_MODELS))
        GeminiTryOnProvider().generate(
            {
                "model_preset": preset,
                "photo_kind": "preset",
                "clothing_image_paths": [str(shirt)],
                "garment_labels": ["Garment 1 — top."],
                "output_dir": str(tmp_path),
            }
        )
        parts = calls[0]
        images_sent = [p for p in parts if not isinstance(p, str)]
        assert len(images_sent) == 1  # the garment only
        assert PRESET_MODELS[preset] in parts[-1]

    def test_preset_portrait_is_sent_as_the_face_reference(self, gemini_on, images, tmp_path, monkeypatch):
        portraits = tmp_path / "models"
        portraits.mkdir()
        (portraits / "ava.jpg").write_bytes(_png_bytes((90, 70, 60)))
        monkeypatch.setattr(gemini_tryon, "PORTRAIT_DIR", portraits)
        calls = gemini_on()
        _, shirt = images
        GeminiTryOnProvider().generate(
            {
                "model_preset": "ava",
                "photo_kind": "preset",
                "clothing_image_paths": [str(shirt)],
                "garment_labels": ["Garment 1 — top."],
                "output_dir": str(tmp_path),
            }
        )
        parts = calls[0]
        assert "portrait" in parts[0].lower()
        assert len([p for p in parts if not isinstance(p, str)]) == 2  # portrait + garment

    @pytest.mark.parametrize(
        "error, message",
        [
            (gemini_client.GeminiBlocked("SAFETY"), BLOCKED_ERROR),
            (gemini_client.GeminiRateLimited("429"), BUSY_ERROR),
            (gemini_client.GeminiRateLimited("429 ... limit: 0, model: x"), QUOTA_ERROR),
            (gemini_client.GeminiRateLimited("GenerateRequestsPerDayPerProjectPerModel-FreeTier"), QUOTA_ERROR),
            (gemini_client.GeminiFailed("boom"), GENERIC_ERROR),
        ],
    )
    def test_gemini_errors_become_safe_messages(self, gemini_on, images, tmp_path, error, message):
        gemini_on(error=error)
        person, shirt = images
        with pytest.raises(TryOnError) as info:
            GeminiTryOnProvider().generate(
                {
                    "person_image_path": str(person),
                    "photo_kind": "whole_body",
                    "clothing_image_paths": [str(shirt)],
                    "garment_labels": ["Garment 1."],
                    "output_dir": str(tmp_path),
                }
            )
        assert str(info.value) == message

    def test_unreadable_reply_is_generic_error(self, gemini_on, images, tmp_path):
        gemini_on(result=b"not an image")
        person, shirt = images
        with pytest.raises(TryOnError) as info:
            GeminiTryOnProvider().generate(
                {
                    "person_image_path": str(person),
                    "photo_kind": "whole_body",
                    "clothing_image_paths": [str(shirt)],
                    "garment_labels": ["Garment 1."],
                    "output_dir": str(tmp_path),
                }
            )
        assert str(info.value) == GENERIC_ERROR


def test_presets_are_described_people():
    assert len(PRESET_MODELS) >= 4
    for key, description in PRESET_MODELS.items():
        assert key.isidentifier()
        assert len(description) > 20
    assert gemini_tryon.is_preset(next(iter(PRESET_MODELS)))
    assert not gemini_tryon.is_preset("not-a-preset")
