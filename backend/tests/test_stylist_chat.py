"""Unit tests for the pure parts of services/stylist_chat.py."""
from services.stylist_chat import ChatTurn, build_system_prompt, context_block, keep_known_pieces

CLOSET = [
    {"id": "a1", "name": "Denim jacket", "category": "Outerwear", "color": ["blue"], "style": "Casual", "occasion": []},
    {"id": "b2", "name": "White tee", "category": "Tops", "color": [], "style": None, "occasion": ["Casual"]},
]


def test_system_prompt_lists_every_piece_with_its_id():
    prompt = build_system_prompt(CLOSET, {"preferred_styles": ["Minimal"], "preferred_colors": []})
    assert "[a1] Denim jacket" in prompt
    assert "[b2] White tee" in prompt
    assert "Minimal" in prompt


def test_system_prompt_says_when_the_closet_is_empty():
    assert "closet is empty" in build_system_prompt([], {})


def test_system_prompt_is_the_same_for_the_same_closet():
    # Stable text keeps the prompt cache warm across turns.
    assert build_system_prompt(CLOSET, {}) == build_system_prompt(list(CLOSET), {})


def test_context_names_the_language_place_and_time():
    text = context_block({"language": "fil", "place": "Cebu City", "local_time": "19:05"})
    assert "Filipino" in text and "Cebu City" in text and "19:05" in text


def test_only_ids_from_my_closet_survive():
    assert keep_known_pieces(["a1", "zz", "a1", "b2"], CLOSET) == ["a1", "b2"]


def test_chat_turn_shape():
    assert ChatTurn("user", "hi").as_message() == {"role": "user", "content": "hi"}
