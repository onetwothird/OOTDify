---
name: debug-error
description: Diagnose and fix an OOTDify error (app error message, ApiError, Railway log, failing test or traceback) by finding the root cause before changing code. Use when something fails or behaves unexpectedly.
argument-hint: "<error text or symptom>"
---

# Debug an error

1. **Get the exact evidence:** the on-screen message, the `[api] <kind>
   status=…` dev warning, the Railway access-log line
   (`"POST /api/... " <status> ... <duration>us`) and any traceback after it.
   Ask the user for missing pieces rather than guess.
2. **Locate the layer from the `ApiError` kind** (`src/services/apiClient.ts`):
   - `network`: no request line in Railway means the phone never reached the
     server (URL, connectivity, or an oversized upload dropped mid-stream; check
     `shrinkForUpload`).
   - `timeout`: a slow model or a cold start. Compare the request duration with
     the call's `timeoutMs`.
   - `auth` / `consent`: session or terms. Check `require_auth` /
     `require_consent`.
   - `http` 413: payload over `MAX_CONTENT_LENGTH`. 429: a limiter in
     `services/ratelimit.py`.
   - `server`: read the backend traceback.
   - `invalid-response`: the shape the wrapper in `aiApi.ts` expected vs what
     the route returned.
3. **Reproduce with a failing test** at the lowest layer that shows the bug
   (pytest route test or Jest pure-module test).
4. **Fix the root cause.** Never mask it with fallback data, a swallowed
   exception or a looser test.
5. **Run `/verify`** and report: cause, fix, test that went red→green, and
   anything only a device or Railway can confirm.
