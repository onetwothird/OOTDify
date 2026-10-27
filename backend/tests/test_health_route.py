"""GET /health reports which optional services are configured (never secrets)."""
import pytest
from flask import Flask

from routes import detection
from services import cloudinary_service, garment_vision


@pytest.fixture
def client():
    app = Flask(__name__)
    app.register_blueprint(detection.detection_bp)
    return app.test_client()


def test_health_reports_configured_services(client, monkeypatch):
    monkeypatch.setattr(cloudinary_service, "is_configured", lambda: True)
    monkeypatch.setattr(garment_vision, "is_configured", lambda: False)
    body = client.get("/health").get_json()
    assert body["status"] == "ok"
    assert body["cloudinary_configured"] is True
    assert body["garment_vision_configured"] is False


def test_health_exposes_no_credentials(client, monkeypatch):
    monkeypatch.setattr("config.Config.CLOUDINARY_API_SECRET", "super-secret-value")
    monkeypatch.setattr("config.Config.ANTHROPIC_API_KEY", "sk-ant-secret")
    text = client.get("/health").get_data(as_text=True)
    assert "super-secret-value" not in text
    assert "sk-ant-secret" not in text


def test_plain_health_never_calls_cloudinary(client, monkeypatch):
    def boom():
        raise AssertionError("the app polls /health; it must stay offline-cheap")

    monkeypatch.setattr(cloudinary_service, "verify_credentials", boom)
    assert client.get("/health").status_code == 200


def test_cloudinary_check_reports_accepted_keys(client, monkeypatch):
    monkeypatch.setattr(cloudinary_service, "verify_credentials", lambda: None)
    body = client.get("/health?check=cloudinary").get_json()
    assert body["cloudinary_ok"] is True
    assert body["cloudinary_error"] is None


def test_cloudinary_check_reports_why_keys_fail(client, monkeypatch):
    monkeypatch.setattr(cloudinary_service, "verify_credentials", lambda: "Invalid API key or secret")
    body = client.get("/health?check=cloudinary").get_json()
    assert body["cloudinary_ok"] is False
    assert body["cloudinary_error"] == "Invalid API key or secret"
