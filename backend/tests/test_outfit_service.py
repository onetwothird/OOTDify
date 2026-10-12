"""Unit tests for the server-side outfit composer.

Run:  cd backend && .venv/Scripts/python -m pytest tests/ -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.outfit_service import (  # noqa: E402
    bucket_items,
    compose,
    missing_slots,
    slot_of,
)


def _item(id_: str, category: str, subcategory: str = "", score: float = 0.0, gender: str = "unisex"):
    return {
        "id": id_,
        "name": f"{subcategory or category} {id_}",
        "category": category,
        "subcategory": subcategory or None,
        "image_url": f"https://example.test/{id_}.jpg",
        "occasion": ["Casual"],
        "gender": gender,
        "score": score,
    }


def _catalog():
    return [
        _item("t1", "Tops", "T-Shirts", 2.0),
        _item("t2", "Tops", "Shirts", 1.0),
        _item("b1", "Bottoms", "Shorts", 2.0),
        _item("b2", "Bottoms", "Jeans", 1.0),
        _item("s1", "Shoes", "Sneakers", 2.0),
        _item("s2", "Shoes", "Sandals", 1.0),
        _item("o1", "Outerwear", "Jackets", 1.0),
        _item("d1", "Dresses", "Dresses", 1.5),
        _item("g1", "Bags", "Handbags", 0.5),
        _item("a1", "Accessories", "Watches", 0.5),
    ]


def test_slot_of_maps_categories():
    assert slot_of(_item("x", "Tops")) == "top"
    assert slot_of(_item("x", "Bottoms", "Shorts")) == "bottom"
    assert slot_of(_item("x", "Shoes", "Sneakers")) == "shoes"
    assert slot_of(_item("x", "Outerwear", "Jackets")) == "outer"
    assert slot_of(_item("x", "Dresses")) == "dress"
    assert slot_of(_item("x", "Bags", "Handbags")) == "bag"
    assert slot_of(_item("x", "Accessories", "Watches")) == "accessory"


def test_bucket_items_groups_by_slot():
    buckets = bucket_items(_catalog())
    assert len(buckets["top"]) == 2
    assert len(buckets["bottom"]) == 2
    assert len(buckets["shoes"]) == 2
    assert len(buckets["dress"]) == 1


def test_compose_returns_complete_looks():
    outfits = compose(_catalog(), occasion="Casual", count=3, seed=42)
    assert outfits, "expected at least one outfit"
    for outfit in outfits:
        slots = {slot_of(i) for i in outfit["items"]}
        # Either a dress look or top+bottom, and always shoes.
        assert ("dress" in slots) or ("top" in slots and "bottom" in slots)
        assert "shoes" in slots
        assert outfit["score"] > 0
        assert outfit["reason"].startswith("Paired")
        assert outfit["occasion"] == "Casual"


def test_compose_is_deterministic_for_a_seed():
    a = compose(_catalog(), occasion="Casual", count=3, seed=7)
    b = compose(_catalog(), occasion="Casual", count=3, seed=7)
    assert [o["id"] for o in a] == [o["id"] for o in b]
    assert [
        [i["id"] for i in o["items"]] for o in a
    ] == [[i["id"] for i in o["items"]] for o in b]


def test_hot_weather_excludes_outerwear():
    outfits = compose(_catalog(), count=4, seed=1, weather={"tempC": 30})
    for outfit in outfits:
        assert all(slot_of(i) != "outer" for i in outfit["items"])


def test_cold_weather_includes_outerwear():
    outfits = compose(_catalog(), count=1, seed=1, weather={"tempC": 2})
    assert outfits
    slots = {slot_of(i) for i in outfits[0]["items"]}
    assert "outer" in slots


def test_gender_filter_keeps_unisex_and_matching():
    items = [
        _item("m1", "Tops", "Shirts", gender="men"),
        _item("w1", "Tops", "Blouses", gender="women"),
        _item("u1", "Bottoms", "Shorts", gender="unisex"),
        _item("s1", "Shoes", "Sneakers"),
    ]
    outfits = compose(items, count=1, seed=3, gender="women")
    assert outfits
    genders = {(i.get("gender") or "unisex") for i in outfits[0]["items"]}
    assert "men" not in genders


def test_missing_slots_reports_gaps():
    picked = [_item("t1", "Tops")]
    assert "bottom" in missing_slots(picked, is_hot=False, is_cold=False)
    assert "shoes" in missing_slots(picked, is_hot=False, is_cold=False)
    assert "outer" in missing_slots(picked, is_hot=False, is_cold=True)
    assert "outer" not in missing_slots(picked, is_hot=True, is_cold=False)


def test_empty_catalog_returns_empty():
    assert compose([], count=3) == []


def test_only_accessories_returns_empty():
    # No core slot can be filled → honest empty result, not a fake look.
    assert compose([_item("a1", "Accessories", "Watches")]) == []
