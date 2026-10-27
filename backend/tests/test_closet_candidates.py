"""Recommendations and outfits come from the caller's closet, not the catalog.

Only the two blueprints are mounted; the closet loader and profile lookup are
replaced by fakes, and the catalog loader raises so any use of it fails.
Auth is satisfied by pre-seeding flask.g the way require_user caches it.
"""
from collections import defaultdict, deque

import pytest
from flask import Flask, g

from routes import outfits, recommend
from services import catalog_service, ratelimit
from services.catalog_service import closet_row_to_candidate


def _row(item_id, category, **extra):
    return {
        "id": item_id,
        "user_id": "user-1",
        "name": f"{category} {item_id}",
        "category": category,
        "color": "Black",
        "size": "M",
        "style": "Casual",
        "brand": None,
        "occasion": ["Casual"],
        "image_url": f"wardrobe/user-1/{item_id}.jpg",
        **extra,
    }


CLOSET = [_row("t1", "Tops"), _row("b1", "Bottoms"), _row("s1", "Shoes"), _row("o1", "Outerwear")]


@pytest.fixture
def closet_calls(monkeypatch):
    calls = []

    def fake_loader(user_id, limit=500):
        calls.append(user_id)
        return [closet_row_to_candidate(r) for r in calls_rows["rows"]]

    calls_rows = {"rows": CLOSET}

    def no_catalog(*args, **kwargs):
        raise AssertionError("the stock catalog must not be used")

    for module in (recommend, outfits):
        monkeypatch.setattr(module, "load_closet_candidates", fake_loader)
        monkeypatch.setattr(module, "ensure_profile", lambda user_id: {})
    monkeypatch.setattr(catalog_service, "load_candidates", no_catalog)
    return {"calls": calls, "rows": calls_rows}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr("services.consent.has_required_consent", lambda user: True)
    monkeypatch.setattr(ratelimit, "_events", defaultdict(deque))
    app = Flask(__name__)
    app.register_blueprint(recommend.recommend_bp)
    app.register_blueprint(outfits.outfits_bp)

    @app.before_request
    def _fake_user():
        g.current_user = {"id": "user-1", "email": None, "user_metadata": {}}

    return app.test_client()


def test_maps_a_full_closet_row():
    c = closet_row_to_candidate(_row("t1", "Tops", brand="Uniqlo"))
    assert c["id"] == "t1" and c["category"] == "Tops" and c["name"] == "Tops t1"
    assert c["color"] == ["Black"] and c["sizes"] == ["M"] and c["occasion"] == ["Casual"]
    assert c["gender"] == "unisex" and c["source"] == "closet" and c["brand"] == "Uniqlo"
    assert c["image_url"] == "wardrobe/user-1/t1.jpg" and c["subcategory"] is None


def test_maps_a_row_with_missing_fields():
    c = closet_row_to_candidate(
        {"id": "x", "name": None, "category": None, "color": None, "size": None, "occasion": None, "image_url": None}
    )
    assert c["name"] == "Item" and c["color"] == [] and c["sizes"] == [] and c["occasion"] == []


def test_name_falls_back_to_category():
    assert closet_row_to_candidate({"id": "x", "name": "", "category": "Shoes"})["name"] == "Shoes"


def test_recommend_uses_callers_closet(client, closet_calls):
    resp = client.post("/api/recommend", json={"limit": 8})
    body = resp.get_json()
    assert resp.status_code == 200, body
    assert closet_calls["calls"] == ["user-1"]
    assert {r["id"] for r in body["recommendations"]} <= {"t1", "b1", "s1", "o1"}
    assert body["recommendations"]


def test_recommend_empty_closet(client, closet_calls):
    closet_calls["rows"]["rows"] = []
    body = client.post("/api/recommend", json={}).get_json()
    assert body["success"] is True and body["recommendations"] == []


def test_outfits_empty_closet_reason(client, closet_calls):
    closet_calls["rows"]["rows"] = []
    body = client.post("/api/outfits", json={}).get_json()
    assert body["pool"] == 0 and body["outfits"] == []
    assert body["reason"] == "Your closet is empty. Capture a few clothes first."


def test_outfits_compose_from_closet(client, closet_calls):
    body = client.post("/api/outfits", json={"count": 2, "seed": 1}).get_json()
    assert closet_calls["calls"] == ["user-1"]
    assert body["outfits"], body
    for outfit in body["outfits"]:
        assert {item["id"] for item in outfit["items"]} <= {"t1", "b1", "s1", "o1"}


def test_missing_fields_do_not_crash(client, closet_calls):
    closet_calls["rows"]["rows"] = [
        {"id": "n1", "category": None, "color": None},
        {"id": "n2", "category": "Tops", "color": None, "occasion": None},
    ]
    assert client.post("/api/recommend", json={}).status_code == 200
    assert client.post("/api/outfits", json={}).status_code == 200
