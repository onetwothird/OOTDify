"""Ask Penggi and garment vision on Gemini: routing, request shape, error mapping.

generate_json is replaced, so nothing reaches Google.
"""
import json

import pytest
from PIL import Image

from services import garment_vision, gemini_client, stylist_chat
from services.stylist_chat import ChatTurn

CLOSET = [{"id": "a1", "name": "Denim jacket", "category": "Outerwear", "color": ["blue"], "occasion": []}]


@pytest.fixture
def gemini_on(monkeypatch):
    monkeypatch.setattr("config.Config.GEMINI_API_KEY", "gemini-test-key")
    monkeypatch.setattr("config.Config.ANTHROPIC_API_KEY", "")
    calls = []

    def respond(reply):
        def fake(**kwargs):
            calls.append(kwargs)
            if isinstance(reply, Exception):
                raise reply
            return reply

        monkeypatch.setattr(gemini_client, "generate_json", fake)

    return respond, calls


def test_gemini_key_alone_turns_both_features_on(monkeypatch):
    monkeypatch.setattr("config.Config.GEMINI_API_KEY", "gemini-test-key")
    monkeypatch.setattr("config.Config.ANTHROPIC_API_KEY", "")
    assert stylist_chat.is_configured() and garment_vision.is_configured()


def test_no_keys_means_not_configured(monkeypatch):
    monkeypatch.setattr("config.Config.GEMINI_API_KEY", "")
    monkeypatch.setattr("config.Config.ANTHROPIC_API_KEY", "")
    assert not stylist_chat.is_configured()
    with pytest.raises(stylist_chat.StylistNotConfiguredError):
        stylist_chat.chat([ChatTurn("user", "hi")], CLOSET, {}, {})


def test_chat_sends_turns_as_gemini_roles_and_keeps_known_pieces(gemini_on):
    respond, calls = gemini_on
    respond(json.dumps({"reply": "Wear the jacket!", "piece_ids": ["a1", "zz"]}))
    history = [ChatTurn("user", "hi"), ChatTurn("assistant", "Hello!"), ChatTurn("user", "What now?")]
    out = stylist_chat.chat(history, CLOSET, {}, {"language": "fil"})
    assert out == {"reply": "Wear the jacket!", "piece_ids": ["a1"]}
    turns = calls[0]["turns"]
    assert [role for role, _ in turns] == ["user", "model", "user"]
    assert turns[-1][1][1] == "What now?" and "Filipino" in turns[-1][1][0]
    assert "[a1] Denim jacket" in calls[0]["system"]
    assert "additionalProperties" not in calls[0]["schema"]


def test_chat_maps_a_safety_block_to_refused(gemini_on):
    respond, _ = gemini_on
    respond(gemini_client.GeminiBlocked("SAFETY"))
    with pytest.raises(stylist_chat.StylistRefusedError):
        stylist_chat.chat([ChatTurn("user", "hi")], CLOSET, {}, {})


@pytest.mark.parametrize("error", [gemini_client.GeminiRateLimited("429"), gemini_client.GeminiFailed("boom")])
def test_chat_maps_other_failures_to_stylist_error(gemini_on, error):
    respond, _ = gemini_on
    respond(error)
    with pytest.raises(stylist_chat.StylistError):
        stylist_chat.chat([ChatTurn("user", "hi")], CLOSET, {}, {})


def test_chat_rejects_junk_output(gemini_on):
    respond, _ = gemini_on
    respond("not json")
    with pytest.raises(stylist_chat.StylistError):
        stylist_chat.chat([ChatTurn("user", "hi")], CLOSET, {}, {})


def test_garment_photo_goes_to_gemini_as_jpeg(gemini_on, tmp_path):
    respond, calls = gemini_on
    respond(json.dumps({
        "found": True, "category": "Tops", "name": "White tee", "color": "white",
        "pattern": "solid", "fit": "relaxed", "description": "A plain tee.",
        "box": {"x": 0.1, "y": 0.1, "w": 0.5, "h": 0.6},
    }))
    photo = tmp_path / "shirt.jpg"
    Image.new("RGB", (200, 300), "white").save(photo)
    out = garment_vision.describe_garment(photo)
    assert out.found and out.name == "White tee" and out.category == "Tops"
    (role, parts), = calls[0]["turns"]
    assert role == "user" and parts[0][0] == "image/jpeg" and parts[0][1][:2] == b"\xff\xd8"
    assert parts[1] == garment_vision.PROMPT


def test_garment_block_is_a_vision_error(gemini_on, tmp_path):
    respond, _ = gemini_on
    respond(gemini_client.GeminiBlocked("IMAGE_SAFETY"))
    photo = tmp_path / "shirt.jpg"
    Image.new("RGB", (50, 50), "white").save(photo)
    with pytest.raises(garment_vision.GarmentVisionError):
        garment_vision.describe_garment(photo)
