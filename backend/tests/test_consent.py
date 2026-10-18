"""Unit tests for consent enforcement helpers (services/consent.py).

Pure logic tests — no HTTP layer, no live Supabase (matching the existing test
suite's service-only style).
"""
from services.consent import (
    REQUIRED_TERMS_VERSION,
    consent_version,
    has_required_consent,
)


class TestConsentVersion:
    def test_reads_matching_version(self):
        user = {"user_metadata": {"terms_version": REQUIRED_TERMS_VERSION}}
        assert consent_version(user) == REQUIRED_TERMS_VERSION
        assert has_required_consent(user) is True

    def test_reads_stale_version(self):
        user = {"user_metadata": {"terms_version": "2026-01-01"}}
        assert consent_version(user) == "2026-01-01"
        assert has_required_consent(user) is False

    def test_missing_metadata_key(self):
        assert consent_version({"user_metadata": {}}) is None
        assert has_required_consent({"user_metadata": {}}) is False

    def test_missing_metadata_entirely(self):
        assert consent_version({"user_metadata": None}) is None
        assert consent_version({}) is None
        assert has_required_consent({}) is False

    def test_none_user(self):
        assert consent_version(None) is None
        assert has_required_consent(None) is False

    def test_non_mapping_metadata_is_not_trusted(self):
        assert consent_version({"user_metadata": "2026-10-18"}) is None
        assert has_required_consent({"user_metadata": "2026-10-18"}) is False

    def test_non_mapping_user(self):
        assert consent_version([]) is None
        assert has_required_consent("user") is False

    def test_numeric_version_coerced_to_string(self):
        # Metadata comes from JSON; a non-string must not crash the check.
        assert consent_version({"user_metadata": {"terms_version": 123}}) == "123"
        assert has_required_consent({"user_metadata": {"terms_version": 123}}) is False
