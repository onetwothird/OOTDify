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
