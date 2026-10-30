"""Shared test setup."""
import pytest


@pytest.fixture(autouse=True)
def no_real_ai_keys(monkeypatch):
    # backend/.env may hold real keys; tests must never reach Google or Anthropic.
    # A test that needs a provider "on" sets its own fake key.
    monkeypatch.setattr("config.Config.GEMINI_API_KEY", "")
    monkeypatch.setattr("config.Config.ANTHROPIC_API_KEY", "")
