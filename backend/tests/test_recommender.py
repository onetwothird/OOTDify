"""Unit tests for the deterministic recommendation composer.

Run:  cd backend && .venv/Scripts/python -m pytest tests/ -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.recommender_service import recommend, score_item  # noqa: E402


def _item(name: str, category: str, style: str = "Casual", colors=None, occasion=None, gender: str = "unisex"):
    return {
        "id": f"id-{name.lower().replace(' ', '-')}",
        "name": name,
        "category": category,
        "style": style,
        "color": colors or ["white"],
        "occasion": occasion or ["Casual"],
        "gender": gender,
        "sizes": ["S", "M", "L"],
    }


def _profile(**overrides):
    base = {
        "preferred_styles": ["Casual"],
        "preferred_colors": ["black", "white"],
        "preferred_categories": ["Tops", "Bottoms"],
        "sizes": ["M"],
        "gender": "unisex",
    }
    base.update(overrides)
    return base


def test_occasion_match_ranks_higher():
    profile = _profile()
    tee = _item("Tee", "Tops", occasion=["Casual"])
    dress = _item("LBD", "Dresses", style="Elegant", occasion=["Formal", "Party"])
    ranked = recommend([tee, dress], profile, occasion="Formal", limit=2)
    # LBD matches 'Formal' (+3) even though styles/colors differ slightly.
    assert ranked[0]["id"] == dress["id"]


def test_style_and_color_preferences_lift_score():
    profile = _profile(preferred_styles=["Streetwear"], preferred_colors=["black"])
    hoodie = _item("Hoodie", "Tops", style="Streetwear", colors=["black"])
    tee = _item("Tee", "Tops", style="Minimalist", colors=["white"])
    assert score_item(hoodie, profile) > score_item(tee, profile)


def test_unisex_always_fits():
    profile = _profile(gender="women")
    unisex = _item("Bag", "Bags", gender="unisex")
    men = _item("Cargo", "Bottoms", gender="men")
    women = _item("Skirt", "Bottoms", gender="women")
    assert score_item(women, profile) > score_item(men, profile)
    assert score_item(unisex, profile) >= score_item(men, profile)


def test_empty_catalog_returns_empty():
    assert recommend([], _profile(), limit=5) == []


def test_output_contains_score_and_normalized():
    profile = _profile()
    items = [_item("A", "Tops"), _item("B", "Bottoms")]
    out = recommend(items, profile, limit=2)
    assert len(out) == 2
    assert all("score" in i and "score_normalized" in i for i in out)
    assert all(0 <= i["score_normalized"] <= 1 for i in out)


def test_deterministic_ordering():
    profile = _profile()
    items = [_item("A", "Tops"), _item("B", "Bottoms"), _item("C", "Shoes")]
    first = [i["id"] for i in recommend(items, profile, limit=3)]
    second = [i["id"] for i in recommend(items, profile, limit=3)]
    assert first == second