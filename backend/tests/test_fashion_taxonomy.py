"""Unit tests for the fashion taxonomy normalizer.

Run:  cd backend && .venv/Scripts/python -m pytest tests/ -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.fashion_taxonomy import (  # noqa: E402
    normalize_category,
    normalize_colors,
    normalize_gender,
    normalize_occasions,
    normalize_row,
    normalize_sizes,
    normalize_subcategory,
)


def test_topwear_maps_to_tops():
    assert normalize_category("Apparel", "Topwear", "Tshirts") == "Tops"
    assert normalize_category("Apparel", "Topwear", "Shirts") == "Tops"


def test_bottomwear_maps_to_bottoms():
    for article in ("Shorts", "Jeans", "Trousers", "Skirts", "Track Pants"):
        assert normalize_category("Apparel", "Bottomwear", article) == "Bottoms"


def test_footwear_maps_to_shoes():
    assert normalize_category("Footwear", "Shoes", "Casual Shoes") == "Shoes"
    assert normalize_category("Footwear", "Sandal", "Sandals") == "Shoes"


def test_bags_detected_by_subcategory_and_article():
    assert normalize_category("Accessories", "Bags", "Handbags") == "Bags"
    assert normalize_category("Accessories", "Backpacks", "Backpack") == "Bags"
    assert normalize_category("Accessories", "Wallets", "Wallets") == "Bags"


def test_outerwear_detected_by_article_hint():
    assert normalize_category("Apparel", "Outerwear", "Jackets") == "Outerwear"
    assert normalize_category("Apparel", "Topwear", "Rain Jacket") == "Outerwear"


def test_dress_maps_to_dresses():
    assert normalize_category("Apparel", "Dress", "Dresses") == "Dresses"


def test_unknown_maps_to_other():
    assert normalize_category("Personal Care", "Fragrance", "Perfume") == "Accessories"
    assert normalize_category("", "", "") == "Other"


def test_subcategory_aliases():
    assert normalize_subcategory("Tshirts") == "T-Shirts"
    assert normalize_subcategory("Shorts") == "Shorts"
    assert normalize_subcategory("Sports Shoes") == "Sneakers"
    assert normalize_subcategory("Jeans") == "Jeans"
    assert normalize_subcategory(None, None) is None


def test_gender_normalization():
    assert normalize_gender("Men") == "men"
    assert normalize_gender("Boys") == "men"
    assert normalize_gender("Women") == "women"
    assert normalize_gender("Girls") == "women"
    assert normalize_gender("Unisex") == "unisex"
    assert normalize_gender(None) == "unisex"


def test_colors_normalization_and_dedupe():
    assert normalize_colors("Navy Blue") == ["navy blue"]
    assert normalize_colors("Black, White/Blue") == ["black", "white", "blue"]
    assert normalize_colors(["Red", "red", ""]) == ["red"]
    assert normalize_colors(None) == []


def test_sizes_use_category_defaults():
    assert normalize_sizes(None, "Shoes") == ["6", "7", "8", "9", "10", "11"]
    assert normalize_sizes("S,M,L", "Tops") == ["S", "M", "L"]
    assert normalize_sizes(None, "Bags") == ["One Size"]


def test_occasion_mapping():
    assert "Casual" in normalize_occasions("Casual")
    assert "Gym" in normalize_occasions("Sports")
    assert "Office" in normalize_occasions("Formal")
    assert normalize_occasions(None) == ["Casual"]


def test_normalize_row_end_to_end():
    row = {
        "id": 15970,
        "gender": "Men",
        "masterCategory": "Apparel",
        "subCategory": "Topwear",
        "articleType": "Shirts",
        "baseColour": "Navy Blue",
        "season": "Fall",
        "usage": "Casual",
        "productDisplayName": "Turtle Check Men Navy Blue Shirt",
    }
    out = normalize_row(row, source="kaggle")
    assert out["category"] == "Tops"
    assert out["subcategory"] == "Shirts"
    assert out["gender"] == "men"
    assert out["color"] == ["navy blue"]
    assert out["occasion"] == ["Casual", "School", "Travel"]
    assert out["metadata"]["external_id"] == "15970"
    assert out["metadata"]["source"] == "kaggle"
    assert out["name"] == "Turtle Check Men Navy Blue Shirt"
    assert out["price"] is None


def test_normalize_row_handles_nan_like_values():
    row = {
        "id": 5,
        "gender": "Unisex",
        "masterCategory": "Apparel",
        "subCategory": "Bottomwear",
        "articleType": "Shorts",
        "baseColour": "nan",
        "usage": None,
        "productDisplayName": None,
    }
    out = normalize_row(row)
    assert out["category"] == "Bottoms"
    assert out["color"] == []
    assert out["occasion"] == ["Casual"]
    assert out["name"]  # never empty
