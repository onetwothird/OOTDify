"""Tests for the try-on job lifecycle (services/tryon_service.py).

Supabase is replaced by a tiny fake that records the query chain, so these
run without credentials or network.
"""
from datetime import datetime, timezone

import pytest

from services import tryon_service
from services.tryon_service import (
    GENERIC_ERROR,
    INTERRUPTED_ERROR,
    TryOnError,
    TryOnJobStore,
    TryOnPipeline,
    VTONProvider,
)


class _Query:
    """Records one query chain; `.execute()` returns the scripted data."""

    def __init__(self, client, table):
        self.client = client
        self.table = table
        self.ops = []

    def __getattr__(self, name):
        def record(*args, **kwargs):
            self.ops.append((name, args))
            return self

        return record

    def execute(self):
        self.client.executed.append(self)
        data = self.client.responses.pop(0) if self.client.responses else []
        return type("Resp", (), {"data": data})()


class _FakeClient:
    def __init__(self, responses=None):
        self.responses = list(responses or [])
        self.executed = []

    def table(self, name):
        return _Query(self, name)


@pytest.fixture
def fake_client(monkeypatch):
    client = _FakeClient()
    monkeypatch.setattr(tryon_service, "get_supabase", lambda: client)
    return client


class _RecordingStore:
    def __init__(self):
        self.updates = []

    def update(self, job_id, **fields):
        self.updates.append((job_id, fields))
        return {}


def _pipeline(provider, monkeypatch):
    pipeline = TryOnPipeline.__new__(TryOnPipeline)
    pipeline.provider = provider
    pipeline.store = _RecordingStore()
    return pipeline


class TestFailStaleProcessing:
    def test_only_targets_old_processing_jobs(self, fake_client):
        fake_client.responses = [[{"id": "j1"}, {"id": "j2"}]]
        count = TryOnJobStore().fail_stale_processing(900)

        assert count == 2
        query = fake_client.executed[0]
        update = next(args for name, args in query.ops if name == "update")[0]
        assert update["status"] == "failed"
        assert update["error"] == INTERRUPTED_ERROR
        assert ("eq", ("status", "processing")) in query.ops
        lt = next(args for name, args in query.ops if name == "lt")
        assert lt[0] == "updated_at"
        cutoff = datetime.fromisoformat(lt[1])
        age = (datetime.now(timezone.utc) - cutoff).total_seconds()
        assert 895 < age < 905

    def test_nothing_stale(self, fake_client):
        fake_client.responses = [[]]
        assert TryOnJobStore().fail_stale_processing(900) == 0


class TestClaimNext:
    def test_claim_is_guarded_by_queued_status(self, fake_client):
        fake_client.responses = [[{"id": "j1"}], [{"id": "j1", "status": "processing"}]]
        job = TryOnJobStore().claim_next()

        assert job["status"] == "processing"
        claim = fake_client.executed[1]
        assert ("eq", ("status", "queued")) in claim.ops

    def test_lost_race_returns_none(self, fake_client):
        fake_client.responses = [[{"id": "j1"}], []]
        assert TryOnJobStore().claim_next() is None


class TestPipelineRun:
    JOB = {"id": "job-1", "user_id": "user-1", "body_photo_id": "bp-1", "clothing_ids": ["c1"]}

    def test_unconfigured_model_fails_fast_without_downloads(self, monkeypatch):
        pipeline = _pipeline(VTONProvider(""), monkeypatch)
        monkeypatch.setattr(
            tryon_service,
            "get_supabase",
            lambda: (_ for _ in ()).throw(AssertionError("must not touch storage/DB")),
        )
        pipeline.run(self.JOB)

        (job_id, fields), = pipeline.store.updates
        assert job_id == "job-1"
        assert fields["status"] == "failed"
        assert "not configured" in fields["error"]

    def test_expected_error_message_is_kept(self, monkeypatch):
        pipeline = _pipeline(VTONProvider(""), monkeypatch)

        def inner(*_):
            raise TryOnError("Body photo no longer exists.")

        monkeypatch.setattr(pipeline, "_run_inner", inner)
        pipeline.run(self.JOB)
        assert pipeline.store.updates[0][1]["error"] == "Body photo no longer exists."

    def test_unexpected_error_text_is_not_shown_to_users(self, monkeypatch):
        pipeline = _pipeline(VTONProvider(""), monkeypatch)

        def inner(*_):
            raise RuntimeError("storage https://x.supabase.co/object?token=SECRET failed")

        monkeypatch.setattr(pipeline, "_run_inner", inner)
        pipeline.run(self.JOB)

        fields = pipeline.store.updates[0][1]
        assert fields["status"] == "failed"
        assert fields["error"] == GENERIC_ERROR
        assert "SECRET" not in fields["error"]


class TestResolveClothingItem:
    def test_catalog_item(self, fake_client):
        fake_client.responses = [[{"id": "c1", "image_url": "https://x/c1.jpg", "category": "tops"}]]
        got = tryon_service.resolve_clothing_item("user-1", "c1")
        assert got == {"image_url": "https://x/c1.jpg", "category": "tops"}
        assert len(fake_client.executed) == 1
        assert fake_client.executed[0].table == "clothing"

    def test_own_item_is_filtered_by_user(self, fake_client):
        fake_client.responses = [[], [{"id": "i1", "image_url": "wardrobe/i1.jpg", "category": None}]]
        got = tryon_service.resolve_clothing_item("user-1", "i1")
        assert got == {"image_url": "wardrobe/i1.jpg", "category": None}
        own = fake_client.executed[1]
        assert own.table == "clothing_items"
        assert ("eq", ("user_id", "user-1")) in own.ops

    def test_other_users_item_is_none(self, fake_client):
        # The user_id filter makes the database return no row for someone else's item.
        fake_client.responses = [[], []]
        assert tryon_service.resolve_clothing_item("user-1", "theirs") is None

    def test_row_without_image_is_none(self, fake_client):
        fake_client.responses = [[{"id": "c1", "image_url": None, "category": "tops"}], []]
        assert tryon_service.resolve_clothing_item("user-1", "c1") is None
