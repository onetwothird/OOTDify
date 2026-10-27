"""Unit tests for services/cloudinary_service.py.

The Cloudinary SDK is patched out — no network, no real credentials.
"""
import pytest

from config import Config
from services import cloudinary_service


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(Config, "CLOUDINARY_CLOUD_NAME", "demo")
    monkeypatch.setattr(Config, "CLOUDINARY_API_KEY", "key")
    monkeypatch.setattr(Config, "CLOUDINARY_API_SECRET", "secret")
    monkeypatch.setattr(Config, "CLOUDINARY_FOLDER", "ootdify")
    monkeypatch.setattr(cloudinary_service, "_configured", False)


@pytest.fixture
def unconfigured(monkeypatch):
    monkeypatch.setattr(Config, "CLOUDINARY_CLOUD_NAME", "")
    monkeypatch.setattr(Config, "CLOUDINARY_API_KEY", "")
    monkeypatch.setattr(Config, "CLOUDINARY_API_SECRET", "")


class TestUploadAvatar:
    def test_uploads_under_user_prefix_and_returns_secure_url(self, configured, monkeypatch):
        calls = {}

        def fake_upload(path, **kwargs):
            calls["path"] = path
            calls.update(kwargs)
            return {"secure_url": "https://res.cloudinary.com/demo/image/upload/x.jpg"}

        monkeypatch.setattr(cloudinary_service.cloudinary.uploader, "upload", fake_upload)
        url = cloudinary_service.upload_avatar("user-1", "/tmp/a.jpg")

        assert url == "https://res.cloudinary.com/demo/image/upload/x.jpg"
        assert calls["path"] == "/tmp/a.jpg"
        assert calls["public_id"].startswith("ootdify/avatars/user-1/")
        assert calls["overwrite"] is False

    def test_public_ids_are_unique(self, configured, monkeypatch):
        ids = []
        monkeypatch.setattr(
            cloudinary_service.cloudinary.uploader,
            "upload",
            lambda path, **kw: ids.append(kw["public_id"]) or {"secure_url": "https://x"},
        )
        cloudinary_service.upload_avatar("u", "a.jpg")
        cloudinary_service.upload_avatar("u", "a.jpg")
        assert ids[0] != ids[1]

    def test_missing_url_raises(self, configured, monkeypatch):
        monkeypatch.setattr(cloudinary_service.cloudinary.uploader, "upload", lambda *a, **k: {})
        with pytest.raises(cloudinary_service.CloudinaryError):
            cloudinary_service.upload_avatar("u", "a.jpg")

    def test_sdk_failure_is_wrapped(self, configured, monkeypatch):
        def boom(*a, **k):
            raise RuntimeError("network down")

        monkeypatch.setattr(cloudinary_service.cloudinary.uploader, "upload", boom)
        with pytest.raises(cloudinary_service.CloudinaryError):
            cloudinary_service.upload_avatar("u", "a.jpg")

    def test_unconfigured_raises_not_configured(self, unconfigured):
        with pytest.raises(cloudinary_service.CloudinaryNotConfiguredError):
            cloudinary_service.upload_avatar("u", "a.jpg")


class TestDeleteUserMedia:
    def test_deletes_by_user_prefix(self, configured, monkeypatch):
        seen = {}
        monkeypatch.setattr(
            cloudinary_service.cloudinary.api,
            "delete_resources_by_prefix",
            lambda prefix, **kw: seen.setdefault("prefix", prefix),
        )
        cloudinary_service.delete_user_media("user-1")
        assert seen["prefix"] == "ootdify/avatars/user-1/"

    def test_unconfigured_is_noop(self, unconfigured, monkeypatch):
        def boom(*a, **k):
            raise AssertionError("must not call Cloudinary")

        monkeypatch.setattr(cloudinary_service.cloudinary.api, "delete_resources_by_prefix", boom)
        cloudinary_service.delete_user_media("user-1")
