# OOTDify — AI Development, Audit, and Improvement Tasks

> **Project:** OOTDify — AI Clothing Stylist  
> **Purpose:** Audit, repair, optimize, secure, and improve the entire application, including clothing catalog, AI try-on, authentication, UI/UX, and Supabase integration.

## Instructions for AI Coding Agents

Read this entire file before modifying the project.

Inspect the existing implementation, identify actual problems, implement fixes directly in the codebase, and verify the results. Execute the phases sequentially, updating the progress checklist only after the corresponding work has been performed and verified.

Do not stop after creating a plan or reporting potential issues. Continue implementing and testing until the work is completed or a genuine blocker prevents further progress.

---

# Global Rules

1. Inspect the existing codebase before changing files.
2. Preserve working features, existing data, API contracts, and user workflows.
3. Follow the existing technology stack, framework conventions, and architecture.
4. Fix root causes instead of hiding errors or introducing fake responses.
5. Do not replace real APIs with mock data simply to make features appear functional.
6. Do not remove working features or perform unnecessary architectural rewrites.
7. Never expose credentials, private API keys, database passwords, or privileged Supabase service-role keys in client-side code.
8. Do not assume an API, external integration, image source, or feature works without testing it.
9. Never claim that a fix, test, or integration succeeded unless you have verified it.
10. Do not delete failing tests, suppress exceptions, or weaken security controls just to achieve a passing result.
11. Back up or checkpoint existing work with Git when possible. Never overwrite unrelated user changes.
12. Document affected files, root causes, fixes, test results, and outstanding blockers.
13. If a task requires credentials, external API access, partner approval, or user confirmation, document the dependency and continue with independent tasks.
14. Update this document's progress checklist when work is actually completed.
15. If execution is interrupted, inspect the current project state and resume from the earliest incomplete task.

## Execution Order

1. Full project audit.
2. API, network, and functional bug fixes.
3. Clothing catalog and image delivery reliability.
4. Security audit and hardening.
5. Performance optimization.
6. UI/UX improvements.
7. Terms and Conditions and Privacy Policy.
8. Final testing and production readiness.

Critical security issues and broken dependencies must be addressed immediately when discovered, even if they belong to a later phase.

---

# Architecture Reference (Actual, Verified)

## Frontend (Expo / React Native)
- **Framework:** Expo SDK 57, React Native 0.86.3, React 19.2.3
- **Language:** TypeScript ~6.0
- **Routing:** expo-router (file-based, `src/app/`)
- **State:** Zustand 5 (`src/features/*/store.ts`, `src/features/*/*Store.ts`)
- **UI:** @expo/vector-icons, expo-glass-effect, expo-image, safe-area-context, react-native-reanimated, react-native-calendars
- **Calendar:** react-native-calendars v1.1314.0
- **Supabase Client:** @supabase/supabase-js ^2.108 (anon key, RLS-enforced)
- **Shared Components:** `src/shared/components/` (GlassCard, ClothingCard, AppButton, Chip, SectionHeader, Skeleton, LoadingState, StateViews)
- **Theme:** `src/shared/config/theme.ts` (warm editorial neutrals, single terracotta accent)

## Backend (Flask / Python)
- **Framework:** Flask 3.x + flask-cors
- **Computer Vision:** Ultralytics YOLO → PyTorch + OpenCV + NumPy
- **Supabase:** supabase-py 2.x (service-role key for DB + private storage)
- **Endpoints:** `/api/analyze`, `/api/body-photos`, `/api/tryon`, `/api/recommend`, `/api/profile`, `/api/privacy/summary`, `/api/account/*`
- **Auth:** Validates Supabase access token per request; derives user ID from token (never from client)

## Database (Supabase / PostgreSQL)
- **Schema:** `supabase/schema.sql` (idempotent, applied via Supabase SQL Editor)
- **Tables:**
  - `clothing` — public catalog (seeded, 10 items, public bucket)
  - `clothing_items` — user wardrobe (private, RLS owner-only)
  - `user_profiles` — preferences, body photo, sizes
  - `body_photos` — uploaded photos + detection/pose/segmentation JSON
  - `try_on_jobs` — async VTON jobs (queued → processing → completed/failed)
  - `saved_outfits` — user-saved outfits (clothing_ids JSONB, optional try_on_id, result_url)
  - `favorites` — user favorites (clothing or item)
  - `recently_viewed` — catalog view history
- **RLS:** All user tables enforce `auth.uid() = user_id`
- **Storage Buckets:** `clothing` (public), `users`, `wardrobe`, `tryons`, `avatars` (private)

## Auth
- Supabase Auth (email/password + Google OAuth via expo-auth-session)
- Tokens stored in expo-sqlite-backed localStorage (native) / localStorage (web)
- Backend validates session token on every request

## Image Delivery
- Catalog (`clothing`): public bucket → direct HTTPS URLs (`image_url`, `thumbnail_url`)
- Wardrobe/Try-on/Avatars: private buckets → signed URLs via `resolveMediaUrl()` (15 min expiry)
- `expo-image` used everywhere with `contentFit="cover"`, `transition={150}`

## Current Working Flows
- Home: recommendations (Flask `/api/recommend`), trending (catalog), wardrobe preview, saved outfits, recently viewed
- Scan: upload body photo → analyze → try-on job → poll → result
- Wardrobe (Discover): catalog browsing + Add to Closet (camera/gallery → upload → clothing_items)
- Outfits: list saved_outfits, delete, view detail
- Profile: privacy summary, export data, delete account

---

# Phase 1 — Full Project Audit

**Status:** Complete (see Audit Report below)

## Objectives

Complete the audit of the actual implementation, verifying every component against the Architecture Reference.

## Tasks

- [x] Identify the actual frontend and backend frameworks (done — see Architecture Reference)
- [x] Review project structure, dependencies, configuration, environment variables (done)
- [x] Identify all pages, components, features, API endpoints, and integrations (done)
- [x] Inspect frontend, backend, database, authentication, storage architecture (done)
- [x] Identify all screens: Home, Scan, Discover, Outfits, Profile, Catalog detail, Item detail, Outfit detail, Auth screens
- [x] Inspect the Hugging Face ingestion script (`backend/scripts/ingest_fashion.py`) — **not obsolete**; it is a live, idempotent re-seeding tool that pulls `ashraq/fashion-product-images-small` over HTTPS, normalizes rows, uploads to the public `clothing` bucket and inserts catalog rows. Distinct from `schema.sql`'s 10-item seed. Requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (server-side only).
- [x] Inspect Supabase Storage buckets and database schema (schema.sql applied, buckets exist)
- [x] Identify source of every displayed clothing image (catalog → public URLs; wardrobe → signed URLs)
- [x] Determine whether any image sources, APIs, or product integrations are failing — backend healthy, CV models load, catalog/signed-URL model verified; **authenticated end-to-end success rates remain untested (no test session — see Phase 2 blockers)**
- [x] Review preloading screen, logo, login, registration screens — **confirmed defect: brand assets referenced by `app.json` were missing (fixed)**; auth forms reviewed (consent, disabled/loading states present)
- [x] Identify console errors, runtime exceptions, broken requests, loading problems — no runtime crashes; lint + endpoint probes run (see report)
- [x] Review performance bottlenecks, unnecessary API calls, possible memory leaks — surfaced via ESLint (`set-state-in-effect` patterns), documented for Phase 5
- [x] Review security controls and privacy-related functionality — **confirmed defect: 6 unauthenticated endpoints (fixed)**; debug-mode + dependency-vuln findings recorded for Phase 4
- [x] Run available tests, linting, type checks, builds — `tsc` clean, `jest` 9/9, `pytest` 41/41, `lint` configured and run, `expo export` run (see report)

## Required Audit Report

For every confirmed issue, document:
- Description and severity
- Root cause, if confirmed
- Affected files or services
- Recommended fix
- How the fix will be verified

Distinguish confirmed defects from potential risks. Do not guess the cause without examining the implementation.

---

## Phase 1 Audit Report

### Confirmed defects (fixed this phase)

| # | Severity | Issue | Root cause | Files | Fix | Verification |
|---|----------|-------|-----------|-------|-----|--------------|
| A1 | **Critical** | `app.json` referenced `assets/images/ootdify-icon.png` (icon) and `assets/images/favicon.png`, but both files were absent from disk → build/splash/logo broken | Assets deleted from working tree (still in git history, commit `a304407`); deletion never committed, so `app.json` pointed at nothing | `assets/images/*`, `app.json` | Restored both files from git (`git checkout --`) | `Test-Path` = True; `npx expo export` succeeds |
| A2 | **High** | Six backend routes accepted unauthenticated requests: `POST /api/detect`, `POST /api/pose`, `POST /api/segment` and `GET /api/{detect,pose,segment}/annotated/<file>`. Exposure = (a) unauthenticated YOLO/pose/seg compute (abuse/DoS, no rate limit on `detect`) and (b) unauthenticated serving of *annotated body-photo overlays* derived from user uploads (privacy). | Routes were written as "development convenience" endpoints without `@require_auth`; unlike `/api/analyze`, they were never locked down. The app calls none of them (verified: only a code comment matches). | `backend/routes/detection.py`, `pose.py`, `segmentation.py` | Added `@require_auth` to all six; added `@upload_limits(...)` to the three upload POSTs (parity with `/api/analyze`, 15/hr). Updated `backend/scripts/test_api.py` to pass `OOTDIFY_API_TOKEN`. | All six now return **401**; `/health` still **200**; `pytest` 41/41 |
| A3 | **Medium** | No linting had ever been run — the repo had **no ESLint config**, so `npm run lint` was non-functional. | `eslint`/`eslint-config-expo` never added as devDependencies; no config file. | `eslint.config.js`, `package.json` | Let `expo lint` bootstrap ESLint 9 + `eslint-config-expo` 57; ran it. | First real run reports **70 problems (39 errors, 31 warnings)** — triaged below, deferred to Phase 5/6 |

### Confirmed defects (found, recorded for later phases — not in Phase 1/2 scope)

| # | Severity | Issue | Where | Phase |
|---|----------|-------|-------|-------|
| A4 | **Medium** | **66 npm vulnerabilities (15 moderate, 49 high, 2 critical)** surfaced during the eslint install. Not yet triaged/updated. | `npm audit` | Phase 4 |
| A5 | **Medium** | **Flask debug mode is on by default** — `FLASK_DEBUG` defaults to `1`, so the dev server runs with the Werkzeug interactive debugger (PIN) active. RCE risk if the port is reachable. Must be `0` in production. | `backend/config.py:18`, server log "Debugger is active! PIN: …" | Phase 4 |
| A6 | **Low** | `src/app/index.tsx` contains a duplicated comment block (lines 1–5 repeated as 6–8). Cosmetic, harmless. | `src/app/index.tsx` | Phase 6 |

### Lint triage (70 problems — no code changed yet)

- `react-hooks/set-state-in-effect` (~20 errors): data-loading effects call `setState` synchronously (e.g. `setLoading(true)` at effect top). React 19/React-Compiler pattern violation → cascading renders. Affects `home`, `outfits`, `profile`, `scan`, `catalog/[id]`, `item/[id]`, `outfit/[id]`, `privacy/data`, `ai-picker`, `useCatalog`, `OutfitCalendar`, `ClothingCard`. **Fix shape:** move initial `setState` out of the effect body / derive initial state. → Phase 5 (perf) / Phase 6.
- `react/no-unescaped-entities` (~15 errors): raw `'` / `"` in JSX text (`login`, `discover`, `scan`, `terms`, `policy`, `outfits`, `+not-found`). **Fix shape:** `&apos;` / `&ldquo;`. → Phase 6 (cosmetic).
- `react-hooks/refs` (4 errors): `Skeleton.tsx` reads `useRef(...).current` during render. → Phase 5.
- `react-hooks/preserve-manual-memoization` (2): `scan.tsx` `useCallback` bodies not preservable by the compiler. → Phase 5.
- Warnings: unused vars (`columns`, `profile`, `editOpen`, `File`, `FavoriteRow`, `isAuthError`…), `import/no-duplicates`, `Array<T>` → `T[]`. → Phase 5/6.

### Verified working (no defect found)

- **`/health`** → 200 `{status:"ok", service:"ootdify-ai", model_loaded:true}`.
- **Type check** `npx tsc --noEmit` → clean. **Jest** → 9/9 (generator + compatibility). **pytest** → 41/41.
- **CV models load**: YOLO `yolo11n.pt`, `yolov8n-pose.pt`, `yolov8n-seg.pt` all ready in <0.2s.
- **Image sources**: catalog → public HTTPS `image_url`/`thumbnail_url`; wardrobe/try-on/avatars → fresh signed URL per mount via `resolveMediaUrl()` (900 s), **no indefinite caching** — expired URLs are re-signed on remount.
- **Duplicate-submission guards**: submit buttons use `disabled={loading|uploading|creating|saving}` across auth, scan, outfits, capture modals.
- **Error mapping**: `apiClient.ts` classifies `network | timeout | auth | server | http | invalid-response | aborted | unknown` and maps each to user-safe copy; raw backend detail logged in `__DEV__` only.
- **Auth gating**: root `_layout.tsx` subscribes to `onAuthStateChange` and redirects between `(auth)` and `(tabs)`.

### Potential risks (not confirmed defects)

- **Backend 401 does not itself force re-auth navigation.** `isAuthError` is exported but never consumed by any screen. A backend 401 surfaces the friendly "session expired" message, but sign-out/redirect relies entirely on supabase-js's own `onAuthStateChange`. Auto-signing out on any 401 would be too aggressive (a transient backend auth misconfig would log everyone out), so no change was made — flagged for a deliberate decision in Phase 4.
- **Long-lived mounted screens** (>15 min) hold an expired signed URL until remount/re-fetch. Low impact because screens remount on navigation; noted for Phase 5.

---

# Phase 2 — API, Network, and Functional Bug Fixes

**Status:** Complete for everything testable without an authenticated user; two items are credential-blocked (documented below).

## Objectives

Resolve broken APIs, network errors, backend failures, and nonfunctional features.

## Known Issues to Investigate

- [x] Scan flow "AI styling is temporarily unavailable" — **root cause was the un-applied schema (fixed in earlier session) plus backend not running.** Re-verified this phase: `/health` → 200 `model_loaded:true`, all three CV models load, `/api/analyze` + `/api/body-photos` correctly return **401** without a token (auth boundary verified). The friendly "AI styling is temporarily unavailable" copy in `apiClient.ts` is the honest `network`-kind message shown when the Flask host is unreachable.
- [x] Try-on worker polling (`try_on_jobs`) — **confirmed 200 OK, zero PGRST205**; worker polls `status=eq.queued` every 5 s, every response `HTTP/2 200` across the whole session log. `PGRST205` appears nowhere in the backend.
- [x] Backend health `/health` → 200, `model_loaded: true` (single listener on :5000, pid 22284).
- [x] Supabase RLS: **policy intent verified** (`auth.uid() = user_id` on all user tables, storage policies cast `auth.uid()::text = owner_id`), and the backend derives `user_id` from the validated token — **but the live two-user cross-leak probe is blocked** (no second authenticated account in this environment; see blockers).
- [x] Signed URL expiry handling (15 min) — `resolveMediaUrl()` signs fresh per mount (`expirySeconds=900`), returns `null` on failure, and **never caches a URL indefinitely**; remount re-signs. Verified by code review of `storageUrl.ts` + its call sites.
- [x] Network error mapping in `src/services/apiClient.ts` → user-friendly messages — verified: all 8 error kinds map to safe copy; `ApiError` never leaks internals; `__DEV__`-only server detail.
- [x] Duplicate request prevention (form submissions, try-on creation) — verified: `disabled={loading|uploading|creating|saving}` on every submit path (auth, scan create, outfit save, capture modals).
- [x] Timeout handling for long-running try-on jobs — verified: `pollTryOnJob` = `maxAttempts:60 × intervalMs:2500` = **150 s cap**, then an honest `ApiError("timeout", "The try-on job is still processing. Check back later.")`.
- [x] Expired session handling → clean 401 — **verified at API level**: garbage/expired Bearer tokens → Supabase `/auth/v1/user` 403 → logged warning → **401** on `/api/profile`, `/api/tryon`, `/api/privacy/summary`, `/api/analyze`, `/api/detect`, `/api/pose`, `/api/segment`. Invalid JSON body also hits 401 *before* parsing (auth checked first). *Client-side forced re-auth navigation is a deliberate open decision — see Phase 1 "potential risks".*
- [x] CORS configuration for LAN IP access (phone → PC backend) — verified: `OPTIONS` preflight → **200**, echoes origin `http://192.168.1.5:8081`, `Access-Control-Allow-Headers: authorization, content-type`, methods `DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT`. `CORS_ORIGINS` defaults to `*` (config-overridable for production).

## Bug fixed this phase

- **Access-control gap (Phase 1 finding A2):** locked down the six unauthenticated routes (`/api/detect`, `/api/pose`, `/api/segment` + three annotated-image routes) with `@require_auth` (+ `@upload_limits` on the three upload POSTs), and updated `backend/scripts/test_api.py` to send `OOTDIFY_API_TOKEN`. Post-fix live probe: all six → **401**, `/health` → **200**.

## Required Testing

Test: successful requests, invalid payloads, expired auth, unauthorized requests, server failures, network timeouts, unexpected responses.

| Scenario | Result |
|----------|--------|
| Successful authenticated request | **BLOCKED** — no test session token in this environment (see blockers) |
| Invalid payload (malformed JSON / multipart) | ✅ 401 (auth first), then 400 with safe message on authenticated paths |
| Expired / garbage auth | ✅ clean 401, no stack trace, warning logged server-side |
| Unauthorized (no token) | ✅ 401 on all 16 protected routes |
| Server failure / model error | ✅ routes return `{success:false,error}` 400/500, never crash the worker (pytest covers handlers) |
| Network timeout | ✅ `AbortController` → `timeout` kind + friendly copy; try-on capped at 150 s |
| Unexpected response shape | ✅ `invalid-response` kind thrown by `uploadBodyPhoto` / `getProfile` / `recommendCatalog` / `composeOutfits` when fields missing |
| CORS preflight (LAN) | ✅ 200 with correct headers |

Do not use fake data or suppress errors to conceal broken functionality.

### Blockers (require credentials / a signed-in account — not worked around)

1. **Authenticated end-to-end success rates for `/api/analyze`, `/api/body-photos`, and try-on create→poll.** Requires a real Supabase session access token and a real photo. Only the auth boundary (401), model loading, and `/health` could be exercised here. *To unblock:* sign in on a device and replay, or mint a throwaway user + token.
2. **Live RLS cross-user leak probe** (two distinct users reading each other's `clothing_items`, `body_photos`, `try_on_jobs`, `saved_outfits`). Requires two accounts. Policy definitions are correct in `schema.sql`; execution against live rows is unverified.

---

# Phase 3 — Clothing Catalog and Image Delivery Reliability

**Status:** Complete (verified — see results below)

## 3.1 Catalog Data Integrity

- [x] Verify `public.clothing` has seeded rows with valid `image_url` / `thumbnail_url` — **250 rows live (10 seed + 240 ingested), all URLs valid** (`backend/scripts/verify_catalog.py`)
- [x] Confirm all URLs are HTTPS and accessible (public bucket) — **all `image_url`/`thumbnail_url` are HTTPS; public `clothing` bucket confirmed via storage API**
- [x] Check for missing images, duplicate records, orphaned storage objects — **found + repaired: re-running the old seed insert had duplicated all 10 seed rows (270 rows total). Root cause: `on conflict do nothing` is a no-op on a table whose only key is a random generated id. 20 duplicate rows deleted (backed up to `backend/data/seed_dedupe_backup_*.json` first), 0 user references needed repointing. New scripts: `verify_catalog.py`, `cleanup_seed_duplicates.py`**
- [x] Verify `clothing_items` RLS: users see only their own items — **empirically probed with the anon key: 0 rows readable, 0 inserts possible on all 8 user tables**
- [x] Verify `saved_outfits.clothing_ids` references exist in `clothing` or `clothing_items` — **2 outfits, all references resolve, 0 dangling**

## 3.2 Image Rendering

- [x] Identify every component rendering clothing images — ClothingCard, catalog/item/outfit detail, home tiles, discover closet, scan results, capture modal (grep-verified)
- [x] Verify `expo-image` usage: `contentFit="cover"`, `transition={150}`, proper aspect ratios — **fixed 4 React Native `Image` usages in `scan.tsx` + 1 in `CaptureClothesModal.tsx` → `expo-image` with `contentFit="cover"` + `transition={150}`; `resizeMode` props replaced**
- [x] Fix broken image sources, invalid URL construction — none found; `resolveMediaUrl()` handles http(s) vs bucket refs correctly
- [x] Correct aspect ratios, sizing, cropping, alignment — fixed `aspectRatio: 0.8` on cards/placeholder (no layout shift)
- [x] Prevent layout shifts while images load (fixed aspectRatio on containers) — placeholders share exact dimensions with loaded images
- [x] Provide loading placeholders (Skeleton) and error fallbacks (placeholder icon) — placeholder views render while unsigned/failed; `resolveMediaUrl` returns `null` honestly instead of a broken image
- [x] Handle expired signed URLs — re-sign on retry, don't show broken image indefinitely — **added a signed-URL cache in `storageUrl.ts`: TTL = expiry − 60 s (a cached URL can never outlive validity), failures return `null` → placeholder, cache wiped on `SIGNED_OUT` so one account's URLs never serve the next**
- [x] Avoid duplicate downloads — **module-level cache keyed by `bucket/path@expiry` dedupes signing across components; catalog images pass through untouched (no signing)**

## 3.3 Wardrobe Upload Pipeline (Add to Closet)

- [x] Trace: camera/gallery → `CaptureClothesModal` → upload → `clothing_items` insert → signed URL — verified end-to-end by code review: client uploads to `wardrobe/<uid>/<uuid>-<sanitized-name>`, inserts a real row, renders via signed URL only
- [x] Verify image validation (type, size, magic bytes) on backend — `image_service.ingest_upload` = extension allowlist + 10 MB cap + Pillow `verify()`+`load()` (real decode, not just magic bytes)
- [x] Confirm private bucket storage (`wardrobe/<uid>/<uuid>.ext`) — enforced by storage RLS `auth.uid()::text = owner_id`; anon cannot list private objects (probe-verified)
- [x] Test cross-device sync (RLS ensures isolation) — **policy verified empirically (anon = 0 rows / 0 inserts); a live two-user probe still requires a second account (documented blocker carried from Phase 2)**

## 3.4 Schema / Seed Idempotency

- [x] Verify `supabase/schema.sql` is idempotent (safe to re-run) — **fixed: seed insert now wrapped in a `do $$` guard that only inserts when no `metadata.source='seed'` rows exist; all other statements were already `if not exists`**
- [x] Confirm seed catalog insert uses `ON CONFLICT DO NOTHING` — **it did, but ineffectively (random PK → never conflicts); replaced by the existence guard above — the root cause of the duplication incident**
- [x] Add `scheduled_date` column to `saved_outfits` if calendar feature needs it — **added idempotently (`add column if not exists`) in `schema.sql`** *(pending: apply to live DB when the calendar ships)*

---

# Phase 4 — Security Audit and Hardening

**Status:** Complete (verified — see results below)

## Authentication and Authorization

- [x] Review session management, token validation, account recovery — Supabase Auth sessions; backend validates the Bearer token against Supabase on **every** request (`auth_service.require_user`), caches per-request on `fl.g`
- [x] Verify server-side authorization on all protected endpoints — **all 16 user-facing routes carry `@require_auth`; `/health` is the only unauthenticated route (liveness probe, returns no data)**
- [x] Prevent unauthorized access to wardrobe images and records (RLS + backend token validation) — anon-key probes: 0 reads / 0 writes on every user table; private buckets not listable
- [x] Verify row-level security policies on all user tables — `auth.uid() = user_id` on all 9 tables + owner-scoped storage policies, all created via idempotent `_ensure_policy`
- [x] Ensure role-based permissions enforced on server (backend derives user_id from token) — every route uses `user["id"]` from the validated token; no client-supplied `user_id` accepted anywhere
- [x] Review OAuth callbacks and redirect URLs — `googleAuth.ts` uses `makeRedirectUri()` (scheme-based `ootdify://`, no hardcoded production URL); PKCE + implicit both handled; no client secret in the bundle
- [x] Protect auth/sensitive endpoints against abuse (rate limiting) — sliding-window limits on every route (`upload_limits` on the 7 write/upload routes incl. try-on create/retry, `default_limits` on reads, strict `account_delete` 10/hr); identity = user id (IP only pre-auth)

## Backend and Database

- [x] Validate all untrusted input on server (file uploads, JSON payloads) — extension allowlist + real image decode + size cap; JSON fields validated (`kind` enum, occasion/gender enums, `_validate_clothing_ids` ownership check on try-on)
- [x] Use safe database query mechanisms (Supabase client, parameterized) — PostgREST only; no string-built SQL anywhere in the backend
- [x] Review SQL injection, XSS, CSRF, broken access control — no SQLi surface (PostgREST); XSS irrelevant (native, no HTML rendering); CSRF not applicable (Bearer-token API, no cookies); access control probe-verified above
- [x] Configure CORS appropriately (LAN IP + localhost) — `CORS_ORIGINS` env-driven, scoped to `/api/*`; preflight verified 200 in Phase 2
- [x] Apply suitable rate limits (try-on, analyze, upload) — see above; all 7 upload/compute routes at 15/hr per user
- [x] Protect file uploads with type, size, content validation — extension + size + Pillow full-decode; stored under server-generated UUID names (`secure_filename` + UUID prefix)
- [x] Ensure API errors don't expose internal details (ApiError mapping in apiClient.ts) — **fixed 5 leaking 500 responses in `detection.py`/`users.py` (`error=f"...{exc}"` leaked internal exception text to clients); now generic copy + `logger.exception` server-side. `ValueError` → 400 paths keep their intentional user-facing validation messages**

## Supabase Security

- [x] Review project configuration and storage access policies — public `clothing` + 4 private owner-scoped buckets, all confirmed by live storage-API probe
- [x] Ensure public catalog assets and private wardrobe assets use correct access model — catalog: direct HTTPS; wardrobe/try-ons/avatars: 15-min signed URLs only
- [x] Verify users cannot read/overwrite/delete another user's private images — anon cannot list; RLS `auth.uid() = owner_id` on select/insert/update/delete; backend signs only after token validation
- [x] Review database permissions and RLS — RLS enabled on all 9 user tables (verified via anon probes returning empty, not errors-with-data)
- [x] Keep service-role keys server-side only (`backend/.env`, git-ignored) — grep of `src/` finds zero service-role references; `git check-ignore` confirms `backend/.env` + root `.env` ignored; only `EXPO_PUBLIC_*` in the bundle
- [x] Verify signed URL expiration and access restrictions — 900 s default, cache TTL ≤ expiry − 60 s, wiped on sign-out
- [x] Ensure no client-side code imports service-role key — grep-verified (no `sb_secret`/`SERVICE_ROLE` in `src/`)

## Secrets and Dependencies

- [x] Inspect configuration and repository files for exposed credentials — secret-pattern grep across tracked files: **no matches**; no `.env` tracked by git
- [x] Verify frontend env vars contain only `EXPO_PUBLIC_*` values — root `.env` holds only `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (+ `.env.local` API URL/weather key)
- [x] Review dependency vulnerabilities (`npm audit`, `pip-audit`) — **npm: 66 → 61 via `npm audit fix` (2 criticals eliminated; remainder are moderate/high in Expo's transitive `@expo/config-plugins` chain — only fixable with `audit fix --force` breaking changes, deliberately not applied). pip: flask-cors 4.0.2 → 6.0.0 (PYSEC-2026-1383/1384/1385), `requirements.txt` constraint updated, `pip-audit` now returns 0 findings; pytest 41/41 still green**
- [x] Apply safe, compatible dependency updates where needed — as above
- [x] Rotate any exposed credentials through authorized processes — no leaked credentials found (nothing to rotate). *Note: the Cloudinary API secret pasted in chat is stored only in git-ignored `backend/.env`; treat chat history as sensitive and consider rotating it if the transcript is shared*
- [x] Keep production and development configurations separate — `FLASK_DEBUG` **default flipped 1 → 0** in `config.py` (Werkzeug debugger = RCE risk on a reachable host); `backend/.env` + `.env.example` updated to `FLASK_DEBUG=0` with guidance comment; `SECRET_KEY` unused for sessions (Bearer auth) — flagged for rotation if ever used

## Data Protection

- [x] Minimize unnecessary collection of personal information — profile stores display prefs only; body photos + analysis JSON owned by user, deletable; weather API key unused in code
- [x] Avoid sensitive information in logs — server logs user **ids** and counts, never photo bytes or tokens; client raw backend detail only in `__DEV__`; the new 500-handler fix removed exception text from client responses
- [x] Review data retention and deletion behavior (export/delete account) — `/api/account/export` returns the full JSON dump; `/api/account/delete` removes storage objects → all rows → auth user. **Fixed: deletion loop is now genuinely best-effort per table (a missing/locked table no longer aborts deletion and strands the account) and includes `outfit_plans`**
- [x] Protect data in transit (HTTPS everywhere) — Supabase + catalog images are HTTPS; local LAN dev uses plain HTTP to the dev machine only (documented in `api.ts`); production must terminate TLS in front of Flask
- [x] Review privacy implications of any third-party integrations — Google OAuth (sign-in only), Unsplash seed images (public CDN), optional Cloudinary (server-side only, keys in `backend/.env`), Hugging Face/Kaggle for catalog ingestion (server-side script)
- [x] Ensure wardrobe photos never exposed through public catalog features — wardrobe rows live only in `clothing_items` (private RLS) and render via signed URLs; catalog table is separate and holds only public-bucket images (probe-verified)

---

# Phase 5 — Performance Optimization

**Status:** Complete for everything performable in this environment; three profiler/device measurement tasks are environment-blocked (documented at the end).

## Objectives

Improve responsiveness without sacrificing correctness or security.

## Tasks

- [ ] Measure baseline performance (React DevTools, Flipper, Xcode/Android Studio profiler) — **environment-blocked (no device/profiler in this workspace); measurable substitutes taken instead: lint problems 109 → 0, bundle size measured via `expo export` (4.4 MB Android Hermes), request-pattern review below**
- [x] Identify slow requests, components, database queries, image-loading operations — **found and fixed real issues: `outfit/[id]` downloaded up to 500 catalog rows to resolve a handful of ids → server-side `in (id, …)` filter; stacked closet refetches (tab focus + screen mount) → single-flight; `profile` state was written but never read (two pointless re-renders per load/save) → removed; image retry cap tightened to spec (2 → 1)**
- [x] Reduce unnecessary component re-renders (React.memo, useMemo, useCallback where measured) — **all 18 `set-state-in-effect` render cascades and ~30 render-phase `ref` reads eliminated (lint 109 → 0); React-Compiler `preserve-manual-memoization` errors fixed via declaration-order corrections; `memo()` on `ClothingCard`, `ClosetCard`, `SmartImage`; dead `profile` state removed**
- [x] Prevent redundant API calls (single-flight patterns, Zustand selectors) — **`loadFromServer` single-flight (concurrent focus + mount callers share one request, cleared when it settles); scan initial loads single-flight (`initialLoadsStarted` guard, also set by `acceptConsent`); every Zustand subscription uses a field selector (grep: zero whole-store subscriptions); `useCatalog` batches catalog + favorites in one `Promise.all`**
- [x] Optimize image rendering and loading (proper sizing, lazy loading, priority) — **`expo-image` at all 6 image call sites (decoded memory/disk cache, `transition` fades); size-aware signing (`resolveMediaUrl(ref, 900)`); `thumbnail_url` preferred for small cards; cards mount lazily via incremental rendering**
- [x] Use pagination/incremental loading for large catalogs (already limited to 6-8 items) — **discover grids now mount 24 cards initially with a "Show more (+N)" button per page (closet ≤100, catalog ≤250); every other list request carries a limit (home 6/8/10, scan 40, recently-viewed 20, closet 100)**
- [x] Implement caching only where appropriate (React Query not used; Zustand + manual) — **no React Query; Zustand owns closet/saved-outfit state; the single manual cache is the in-memory signed-URL memo with TTL**
- [x] Avoid caching expired signed URLs indefinitely — **cache TTL = expiry − 60 s, expired entries re-sign on next resolve, whole cache wiped on `SIGNED_OUT`** *(Phase 3)*
- [x] Prevent private image data from leaking through shared caches — **cache wiped at sign-out; each session signs fresh URLs → different signatures → distinct cache keys, so another account can never hit a previous session's entry; owner-only RLS probe-verified** *(Phases 3/4)*
- [x] Optimize database queries and indexes — **12 indexes incl. `user_id + created_at desc` on every user table (`supabase/schema.sql`); `fetchCatalogish` now filters ids server-side (`in`) instead of fetching 500 rows; all list queries are `.limit(...)`ed; detail screens fetch by id**
- [x] Reduce unnecessary bundle size (expo-router tree-shaking, dynamic imports) — **`expo export --platform android` baseline measured: 4.4 MB Hermes bytecode; declared-but-unused deps (`react-native-calendars`, `expo-glass-effect`, `react-native-reanimated`) are outside the module graph → not bundled; Metro drops unimported exports; expo-router keeps routes file-scoped**
- [x] Clean up event listeners and subscriptions (useEffect cleanup) — **grep: zero raw `addEventListener` anywhere in `src/`; the one interval (scan try-on polling) is cleared on cleanup (`scan.tsx:256-257`); focus subscriptions use `useFocusEffect`'s built-in unsubscribe; async image resolutions guard with `alive` flags**
- [x] Optimize animations and transitions (reanimated worklets) — **the only JS-driven animation is the Skeleton pulse with `useNativeDriver: true` (runs off the JS thread); image fades via expo-image `transition`; `react-native-reanimated` 4.5.1 is installed as a Phase 6 asset — no worklet animations exist yet to optimize**
- [x] Keep primary interactions responsive during network requests — **every async flow ships loading + error UI (skeletons/spinners/empty states); favorite toggle is optimistic with rollback; signed-URL cache keeps image resolution off the network; microtask-deferred loaders avoid render cascades**
- [ ] Test on supported devices and realistic network conditions — **environment-blocked: no device/emulator in this workspace; automated suites (below) are the substitute**

## Image-Specific Performance

- [x] Prevent duplicate image downloads (per-component `useResolvedImage` memoization) — **`useResolvedImage` resolves once per image ref (ref-keyed derived state, no re-resolve per render); the signed-URL cache dedupes concurrent re-signs; expo-image caches decoded bytes by URL**
- [x] Avoid requesting unnecessarily large images for small cards (use `thumbnail_url`) — **`ClothingCard` renders `thumbnail_url || image_url`; resolution is size-capped (`resolveMediaUrl(ref, 900)`)**
- [x] Use supported image optimization mechanisms (expo-image automatic) — **expo-image adopted in Phase 3 (scan, capture modal) and wrapped by `SmartImage`, which every card uses**
- [x] Ensure lazy-loaded images eventually appear (IntersectionObserver not needed; FlatList/ScrollView) — **every image renders inside a ScrollView-mounted card that resolves its own URL on mount — no viewport gating that could strand an image invisible**
- [x] Handle failed image requests without endless retries (max 1 retry, then placeholder) — **`MAX_RETRIES = 1` in `useResolvedImage`, then the `SmartImage` placeholder**
- [x] Avoid loading entire catalog at once (already paginated/limited) — **catalog fetch is metadata-only (250 rows, measured in Phase 3) and mounts incrementally (24 + "Show more"); by-id lookups use `in (ids)`; every other call site limits to 6–100 rows; image bytes are never preloaded**
- [ ] Measure catalog scrolling performance with realistic item counts (50+ items) — **environment-blocked (needs a device); mitigated so only 24 cards mount initially and each "Show more" adds 24**

## Verification

```bash
npx tsc --noEmit                      # 0 errors
npm test                              # 9/9 (generator + compatibility)
npm run lint                          # 0 problems (first run: 109)
npx expo export --platform android    # baseline bundle: 4.4 MB (Android Hermes)
cd backend && python -m pytest -q     # 41 passed
```

- Lint trajectory: **109 → 65 → 42 → 0** problems (0 errors, 0 warnings). `npx eslint .` also exits 0 after `eslint.config.js` ignores were scoped to `dist/*`, `.expo/*`, `backend/.venv/*` (raw runs had been linting the Python venv's vendored JS).
- Bundle baseline: `_expo/static/js/android/entry-*.hbc` = **4.4 MB**.

## Environment-blocked (documented, not skipped)

Device-profiler baselines (React DevTools / Flipper / Xcode & Android Studio profilers), on-device scroll profiling with 50+ cards, and throttled-network device testing require a physical device or emulator that this workspace does not have. Measurable static substitutes (lint baseline, bundle export, request-pattern analysis, unit suites) cover everything performable headless; re-run these three items on hardware when available.

---

# Phase 6 — UI/UX Improvements

**Status:** Not started

## Preloading Screen and Logo

- [ ] Locate the correct existing brand logo asset
- [ ] Fix logo path, dimensions, aspect ratio, alignment, transparency
- [ ] Ensure sharp rendering on supported displays
- [ ] Prevent unnecessary flashing and layout shifts
- [ ] Ensure loading ends correctly on both success and failure

## Login and Registration

- [ ] Refine spacing, typography, colors, form widths, visual hierarchy
- [ ] Remove awkward alignment, inconsistent spacing, unnecessary clutter
- [ ] Ensure responsive layouts across mobile, tablet, desktop
- [ ] Improve input labels, validation, error messages
- [ ] Provide accessible password visibility controls
- [ ] Implement loading and disabled states
- [ ] Prevent repeated form submissions
- [ ] Verify password recovery, logout, session handling
- [ ] Preserve working authentication integrations
- [ ] Ensure keyboard navigation and readable contrast

## Home Screen Redesign (per new spec)

- [ ] Dynamic greeting (time-aware)
- [ ] Glass-effect "Today's Outfit" preview card (expo-glass-effect GlassView, iOS 26+; fallback on older)
- [ ] OutfitCalendar component (react-native-calendars, markedDates from scheduled outfits)
- [ ] Floating/inline AI Chatbot entry point (navigates to chat modal/screen — backend endpoint TBD)
- [ ] Preserve real-data sections: recommendations, wardrobe, recent looks, recently viewed, trending
- [ ] Monochrome palette (theme.ts), smooth transitions (reanimated), glassmorphism where appropriate

## Calendar Feature (New)

- [ ] Add `scheduled_date` column to `saved_outfits` (idempotent migration in schema.sql)
- [ ] Extend `SavedOutfit` interface + service functions (fetchByDate, schedule, unschedule)
- [ ] Create Zustand store: `src/features/outfit/useOutfitStore.ts` (scheduled outfits per date, greeting logic)
- [ ] Create `src/features/outfit/OutfitCalendar.tsx` (themed, markedDates, onDayPress → outfit detail)
- [ ] Integrate into Home screen (`src/app/(tabs)/index.tsx` — rename from `home.tsx`)

## Global UI

- [ ] Fix responsive layouts and overflow
- [ ] Standardize spacing, colors, typography, reusable components
- [ ] Improve focus, hover, active, disabled, loading states
- [ ] Remove unnecessary animations and visual clutter
- [ ] Improve accessibility and keyboard usability
- [ ] Preserve existing functionality and design intent

---

# Phase 7 — Terms and Conditions and Privacy Policy

**Status:** Not started

## Terms and Conditions

- [ ] Create dedicated Terms and Conditions page (`src/app/terms.tsx`)
- [ ] Add links in appropriate locations (registration, profile, settings)
- [ ] Document applicable account rules and user responsibilities
- [ ] Reflect actual features and limitations of OOTDify
- [ ] Explain applicable marketplace/affiliate disclosures where relevant

## Privacy Policy

- [ ] Create/improve Privacy Policy based on actual data practices (`src/app/privacy/policy.tsx` exists — enhance)
- [ ] Identify data collected and purposes of processing
- [ ] Document relevant storage, third-party services, sharing
- [ ] Address retention, deletion, applicable user rights
- [ ] Describe data handling for wardrobe photos and AI try-on
- [ ] Avoid claiming unsupported privacy controls exist

## Registration Consent

- [ ] Add required, unchecked-by-default agreement checkbox where explicit consent required
- [ ] Enforce required consent on backend where applicable
- [ ] Record accepted terms version and timestamp where appropriate
- [ ] Ensure direct API requests cannot bypass required consent

Consider applicable Philippine legal requirements (Data Privacy Act of 2012). Flag content requiring owner/legal review.

---

# Phase 8 — Final Testing and Production Readiness

**Status:** Not started

## Functional Testing

- [ ] Verify every accessible page and major section
- [ ] Test navigation, buttons, forms, interactive elements
- [ ] Test login, registration, logout, password recovery
- [ ] Verify API endpoints and database operations
- [ ] Verify authorization and user data isolation
- [ ] Test network failures and error recovery
- [ ] Verify clothing catalog loading (public + signed URLs)
- [ ] Verify signed URL handling (expiry, refresh)
- [ ] Verify catalog seeding pipeline (schema.sql re-run)
- [ ] Verify Add to Closet and private wardrobe images
- [ ] Verify responsive layouts (phone, tablet, web)
- [ ] Verify no major regression introduced

## Automated Checks

Run available:
- [ ] Unit tests (`npm test`, `cd backend && python -m pytest -q`)
- [ ] Type checks (`npx tsc --noEmit`)
- [ ] Linting (`npm run lint`)
- [ ] Production build (`npx expo export`)
- [ ] Dependency security checks (`npm audit`, `pip-audit`)

Do not assume a successful build proves the application works correctly.

## Final Report

Provide a report containing:
1. Project architecture reviewed
2. Confirmed issues and root causes
3. Files modified
4. API and network test results
5. Clothing image pipeline test results
6. Supabase Storage and database consistency results
7. Security findings and fixes
8. Performance measurements where available
9. UI/UX changes
10. Terms and Conditions and Privacy Policy status
11. Tests passed, failed, skipped, blocked
12. Remaining issues and required manual actions
13. Deployment instructions and required environment variables
14. Final production-readiness assessment

Clearly distinguish working integrations from test fixtures, untested features, and integrations blocked by missing credentials or approval.

---

# Definition of Done

- [ ] All accessible application sections have been audited
- [ ] Critical bugs are fixed or have specific documented blockers
- [ ] Core user flows work correctly (Home, Scan, Wardrobe, Outfits, Profile)
- [ ] API failures investigated and resolved where possible
- [ ] Correct preloading logo displayed
- [ ] Login and registration are professional and functional
- [ ] Clothing images load from intended sources (public catalog + signed private)
- [ ] Catalog seeding pipeline verified (schema.sql)
- [ ] Private wardrobe images remain private (RLS + signed URLs)
- [ ] Security controls reviewed and tested
- [ ] Performance issues addressed and measured where practical
- [ ] Terms and Conditions and Privacy Policy accessible
- [ ] Relevant tests have been run
- [ ] No known unresolved critical regressions remain
- [ ] Remaining limitations documented honestly

---

# Progress Checklist

Update these items only when each phase's work has been performed and verified.

- [x] Phase 1 — Full project audit (2 defects fixed: missing brand assets, 6 unauthenticated endpoints; lint bootstrapped + triaged; report above)
- [x] Phase 2 — API and network fixes (all non-credential items verified; 1 auth-hardening fix; 2 credential-blocked items documented)
- [x] Phase 3 — Clothing catalog and image delivery reliability (live verification scripts added; 20 duplicated seed rows repaired + root cause fixed in schema.sql; expo-image consistency + signed-URL cache with sign-out invalidation)
- [x] Phase 4 — Security hardening (all 16 protected routes verified; anon-key RLS probes sealed; 5 error-detail leaks fixed; FLASK_DEBUG default → 0; flask-cors 6.0.0 CVEs fixed, pip-audit clean; npm criticals eliminated; account deletion made truly best-effort)
- [ ] Phase 5 — Performance optimization
- [ ] Phase 6 — UI/UX improvements (includes Home redesign + Calendar)
- [ ] Phase 7 — Terms and Conditions and Privacy Policy
- [ ] Phase 8 — Final testing and production readiness

---

# Instructions for Resuming Work

If work is interrupted:

1. Read this file again.
2. Inspect the current project files and Git changes.
3. Review available progress notes and test results.
4. Determine which tasks have actually been completed.
5. Verify previous fixes if their status is uncertain.
6. Resume from the earliest incomplete phase.
7. Update the checklist only after verification.

**Final instruction:** Start with Phase 1. Execute every phase sequentially, make real code changes, test the actual implementation, and continue until the application reaches the best verified state possible. Do not stop after planning, do not invent missing integrations, and do not claim success without evidence.