// C:\OOTDify\src\shared\config\legal.ts
// Canonical in-app legal document versions (Phase 7).
//
// TERMS_VERSION must stay in sync with REQUIRED_TERMS_VERSION in
// backend/services/consent.py — the backend compares the version recorded in
// the user's auth metadata against its own constant and rejects AI-processing
// requests with 403 consent_required when they don't match. The duplication is
// intentional: the client must not be able to influence what the backend
// enforces. Bump BOTH together whenever the documents change materially.

/** Terms/Privacy version accepted at sign-up or via the consent screen. */
export const TERMS_VERSION = "2026-10-18";

/** Shown next to the "Last updated" line on both documents. */
export const TERMS_DISPLAY_DATE = "October 18, 2026";

export const TERMS_ROUTE = "/privacy/terms" as const;
export const PRIVACY_ROUTE = "/privacy/policy" as const;
