"""Offline unit tests for the ingestion script helpers (no network, no Supabase).

Run:  cd backend && .venv/Scripts/python -m pytest tests/ -q
"""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "scripts"))

from ingest_fashion import (  # noqa: E402
    Budget,
    _content_type,
    _image_url,
    _unwrap_rows,
    _where_clause,
)
from services.fashion_taxonomy import normalize_row  # noqa: E402


def test_where_clause_targets_article_type():
    assert _where_clause("Shorts") == '"articleType"=\'Shorts\''


def test_image_url_from_datasets_server_row():
    row = {"image": {"src": "https://cdn/x.jpg", "height": 80, "width": 60}}
    assert _image_url(row) == "https://cdn/x.jpg"
    assert _image_url({"image": None}) is None
    assert _image_url({}) is None


def test_unwrap_rows_nested_datasets_server_shape():
    raw = [
        {"row_idx": 0, "row": {"id": 1, "image": {"src": "x"}}, "truncated_cells": []},
        {"row_idx": 1, "row": {"id": 2}, "truncated_cells": []},
    ]
    assert _unwrap_rows(raw) == [{"id": 1, "image": {"src": "x"}}, {"id": 2}]


def test_unwrap_rows_flat_fallback():
    raw = [{"id": 1}, {"id": 2}]
    assert _unwrap_rows(raw) == raw


def test_unwrap_rows_ignores_non_dicts():
    assert _unwrap_rows([None, "x", {"id": 1}]) == [{"id": 1}]


def test_content_type_sniffing():
    assert _content_type(b"\x89PNG\r\n\x1a\n" + b"x") == "image/png"
    assert _content_type(b"\xff\xd8jpeg") == "image/jpeg"
    assert _content_type(b"RIFF\x10\x00\x00\x00WEBP") == "image/webp"
    assert _content_type(b"unknown") == "image/jpeg"


def test_budget_respects_total_cap():
    budget = Budget(total=3, per_category=100, per_article=10)
    assert budget.accept("Tops", "T-Shirts")
    assert budget.accept("Tops", "Shirts")
    assert budget.accept("Bottoms", "Shorts")
    assert not budget.accept("Shoes", "Sneakers")  # total reached
    assert budget.accepted == 3
    assert budget.full()


def test_budget_respects_per_category_cap():
    budget = Budget(total=100, per_category=2, per_article=10)
    assert budget.accept("Tops", "T-Shirts")
    assert budget.accept("Tops", "Shirts")
    assert not budget.accept("Tops", "Tops")  # category full
    assert budget.accept("Bottoms", "Shorts")
    assert budget.cat_counts["Tops"] == 2


def test_budget_respects_per_article_cap():
    budget = Budget(total=100, per_category=10, per_article=2)
    assert budget.accept("Tops", "T-Shirts")
    assert budget.accept("Tops", "T-Shirts")
    assert not budget.accept("Tops", "T-Shirts")  # article type full
    assert budget.accept("Tops", "Shirts")


def test_normalize_row_dataset_shape_end_to_end():
    raw = {
        "id": 15970,
        "gender": "Men",
        "masterCategory": "Apparel",
        "subCategory": "Topwear",
        "articleType": "Shirts",
        "baseColour": "Navy Blue",
        "season": "Fall",
        "year": 2011.0,
        "usage": "Casual",
        "productDisplayName": "Turtle Check Men Navy Blue Shirt",
        "image": {"src": "https://cdn/x.jpg"},
    }
    row = normalize_row(raw, source="kaggle:fashion-product-images-small", external_id="15970")
    assert row["category"] == "Tops"
    assert row["subcategory"] == "Shirts"
    assert row["name"] == "Turtle Check Men Navy Blue Shirt"
    assert row["metadata"]["source"].startswith("kaggle:")
    assert row["metadata"]["external_id"] == "15970"


def test_short_and_sneaker_normalization():
    assert normalize_row({"articleType": "Shorts", "subCategory": "Bottomwear", "gender": "Women"})["category"] == "Bottoms"
    assert normalize_row({"articleType": "Sports Shoes", "subCategory": "Footwear", "gender": "Men"})["category"] == "Shoes"
    assert normalize_row({"articleType": "Sports Shoes", "subCategory": "Footwear"})["subcategory"] == "Sneakers"