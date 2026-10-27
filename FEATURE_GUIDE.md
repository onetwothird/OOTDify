# OOTDify — Next Feature Guide

> Working guide for the next round of feature work, written from the user's
> own request plus a grounding pass through the current codebase (not
> guesses — each "Current state" below cites the real file). This is a
> planning doc, not a changelog: nothing listed here has been implemented
> yet. Read `AGENTS.md`/`CLAUDE.md` first for repo conventions before
> picking any item up.

## How to use this file

Work top to bottom unless the user says otherwise. For each feature:
1. Confirm the "Open questions" with the user before writing code where one
   exists — several of these items are genuinely ambiguous as requested.
2. Implement against real data/services per `AGENTS.md` ("No fake data").
3. Update this file's checkbox when done, with a one-line note on what
   actually shipped (same pattern as `AI_TASKS.md`).
4. Run `npx tsc --noEmit`, `npm test`, `cd backend && python -m pytest -q`
   before calling anything finished.

---

## 1. Button positioning polish (global)

- [ ] Status: not started

**Request:** "the positioning of button not awkward"

**Current state:** Buttons go through `src/shared/components/AppButton.tsx`
(and the raw `Pressable` pattern in a few older screens). There's no single
layout bug — "awkward" placement shows up per-screen: e.g. `home.tsx`'s hero
buttons (`heroButtons`, flex-wrap row), `outfits.tsx`'s builder action row,
`scan.tsx`'s step actions, modal footers in `CaptureClothesModal.tsx` /
`EditClothingModal.tsx`. Button components themselves are fine; the issue is
ad-hoc per-screen spacing/alignment decisions.

**Proposed approach:**
- Audit every screen's primary CTA placement against a short rule set:
  primary action always bottom-anchored or top-right (never mid-content),
  consistent `marginTop`/`gap` tokens from `theme.spacing`, destructive
  actions never adjacent to primary actions without a visual gap.
- Prefer sticky footers for primary submit actions on scroll screens
  (signup, edit modals, builder) instead of buttons that scroll out of view.
- Write the rule set once in a short comment block at the top of
  `AppButton.tsx` so it doesn't drift again.

**Open questions:** Need specific screens/screenshots from the user —
"awkward" is subjective. Ask: which screens specifically, before doing a
blind global pass.

**Files likely touched:** `src/shared/components/AppButton.tsx`, and
whichever screens the user points at.

---

## 2. Header redesign per section (less plain)

- [ ] Status: not started

**Request:** "the header too in each section not too simple"

**Current state:** `src/shared/components/ScreenHeader.tsx` is
intentionally minimal — a title, optional subtitle, optional right-side
action, no icon/illustration/visual texture
(`src/shared/components/ScreenHeader.tsx:16-33`). Every tab screen
(`home.tsx`, `discover.tsx`, `community.tsx`, `outfits.tsx`, `profile.tsx`)
either uses `ScreenHeader` directly or rolls its own header block inline.
Home already has a richer custom header (`HomeTopBar` + `Hero`,
`home.tsx:390-456`) — that's the bar to match elsewhere, not reinvent per
screen.

**Proposed approach:**
- Extend `ScreenHeader` with optional visual accents that stay within the
  existing monochrome theme: a small icon/badge slot, an optional thin
  accent bar (`theme.colors.accent`), optional large display-weight title
  variant for top-level tabs vs a compact variant for sub-screens
  (item/catalog/outfit detail, settings sub-pages).
- Keep it one component with props, not a fork per screen — that's how
  `ScreenHeader` ended up simple in the first place and it's reused in ~10
  places; changing it in place upgrades every screen at once.

**Open questions:** Does "not too simple" mean more visual weight (icon,
color block, imagery) or just better information density (stats, avatar,
breadcrumbs)? Confirm direction with a mockup/reference before touching the
shared component, since it fans out to every screen.

**Files:** `src/shared/components/ScreenHeader.tsx` (shared change), then
spot-adjust callers that need a different variant prop.

---

## 3. Clothes capture that auto-selects/isolates the garment

- [x] Status: done — runs automatically on every capture
  (`POST /api/clothing/isolate`, `services/garment_isolation.py`). Uses
  OpenCV GrabCut, not YOLO: the bundled seg weights are COCO-trained and have
  no garment classes (user chose background removal over new model weights).
  Each photo shows the cut-out with a "Use original" toggle; when the cut-out
  isn't trustworthy (`no_object` / `fills_frame` / `multiple_objects`) the
  original is kept and the reason shown. Only the chosen image is stored.
  Checked on 8 real catalog photos (all isolated cleanly).

**Request:** "i want it also to capture a clothes? and it will select the
clothes only?"

**Current state:** `src/features/capture/CaptureClothesModal.tsx` captures
a raw photo (camera or library) and uploads it as-is to the private
`wardrobe` bucket (`uploadToWardrobeBucket`) — no detection, no cropping, no
background removal. The backend already has the model needed for this:
`backend/services/segmentation_service.py` (YOLO-seg,
`SEG_MODEL_PATH=models/yolo/yolov8n-seg.pt` in `.env.example`) and
`backend/routes/detection.py`'s `/api/analyze` with `kind=clothing` currently
only runs plain detection (bounding boxes), not segmentation
(`detection.py:68-74` — `kind=="clothing"` branch calls `.detect()`, not a
segmentation call).

**Proposed approach:**
- Add a `kind=clothing` segmentation path (new endpoint or extend
  `/api/analyze`) that runs the existing seg model, returns a mask/cropped
  region for the dominant clothing item in the frame.
- On capture, call this before upload; show the cropped/background-removed
  result in the review step so the user confirms what gets saved — never
  silently replace their photo with a bad crop (mirrors the honest-failure
  pattern already used for try-on: if detection confidence is low, keep the
  original photo and say so, don't fabricate a result).
- Store both the original and the processed crop only if there's a real
  product need for the original; otherwise store the processed image to
  save space — decide with the user.

**Open questions:** Should this run automatically on every capture, or be
an optional "clean up this photo" button? What happens when multiple
garments are in frame (the current multi-category batch flow captures many
items at once)? Needs a decision before implementation.

**Files:** `backend/routes/detection.py`, `backend/services/segmentation_service.py`,
`src/features/capture/CaptureClothesModal.tsx`, `src/features/clothing/service.ts`.

---

## 4. AR try-on

- [x] Status: live 2D overlay built (`/tryon/live`, branch `feat/live-tryon`).
  The app is closet-only and the photo try-on is hidden behind
  `PHOTO_TRYON_AVAILABLE` until `VTONProvider.generate()` has a real model.
  Earlier spike notes: Spike findings (2026-10-27):
  * Server pose (`yolov8n-pose`, 320px, CPU) is ~30–50 ms/frame once warm.
    With `CameraView.takePictureAsync` snapshots + upload, expect roughly
    1–2 overlay updates/sec on LAN: a "live-ish" preview, not smooth AR.
  * Smooth (~30 fps) tracking needs on-device pose (vision-camera frame
    processors + a TFLite/MediaPipe model), which means a dev build with
    native modules. The project is managed (no `android/`/`ios/`) and only
    has `expo-camera`.
  * Blocker for the snapshot approach: `/api/pose` sits behind
    `upload_limits` (15/hour). A preview loop needs its own stateless,
    per-minute-limited endpoint that keeps only keypoints.

**Request:** "they can try it on like an AR?"

**Current state:** Try-on today (`src/app/(tabs)/scan.tsx`) is strictly
photo-based: upload a body photo → backend VTON job (`/api/tryon`, polled)
→ a static result image. There is **no AR** anywhere in the stack — no
ARKit/ARCore, no `expo-camera`-based live overlay, no 3D/pose-tracked
rendering. `TRYON_MODEL_PATH` in `backend/.env.example` is also empty by
default ("real model weights go here; empty = honest failure" — see
`backend/routes` try-on job handling) — the honest-AI-or-fail pattern the
rest of the app follows.

**Proposed approach (this is a big feature — treat as its own project):**
- Clarify what "AR" means here before scoping further. Two very different
  features both get called "AR try-on":
  1. **Live camera overlay** — hold the phone up, see a garment image
     roughly tracked onto your body in real time (lighter lift: a live
     camera feed + 2D pose keypoints from the existing `pose_service.py`
     driving a 2D garment overlay; not true 3D AR).
  2. **True AR (ARKit/ARCore via `expo-camera`/a dedicated AR lib)** — full
     3D body tracking and garment placement. Expo's AR support is limited
     and usually requires ejecting to a bare workflow or a third-party
     native module — this is a significant scope/dependency decision, not
     a small feature add.
- Recommend starting with option 1 (live 2D overlay using the pose model
  already running server-side or ported to on-device inference) as a
  "try-on preview" distinct from the existing async photo try-on, which
  stays for the final, higher-quality result.
- Do not promise this works end-to-end until a real spike confirms
  feasibility on-device — this is squarely in "do not claim success
  without evidence" territory per `AGENTS.md`.

**Open questions (must resolve before coding):**
- Live overlay vs true 3D AR — which one did the user actually mean?
- Is ejecting from the managed Expo workflow acceptable if true AR needs
  it?
- Does this replace or sit alongside the existing async photo try-on?

**Files:** likely new `src/features/tryon/ar/*`, backend
`services/pose_service.py` (possible on-device port), `scan.tsx` or a new
route.

---

## 5. Capture restricted to photo/video only

- [ ] Status: not started

**Request:** "i want it also be accessible for video/photo only?"

**Current state:** `CaptureClothesModal.tsx` and `scan.tsx` already use
`expo-image-picker` with `mediaTypes: ["images"]` only
(`CaptureClothesModal.tsx:72`, `scan.tsx` camera/picker calls) — video is
not currently offered anywhere in capture or scan. No document/file picker
exists in either flow already, so there's nothing extra to *exclude* today.

**Proposed approach:**
- If the ask is "add video as a second capture option, restricted to
  photo+video and nothing else": add `mediaTypes: ["images", "videos"]` to
  the relevant `ImagePicker`/`CameraView` calls, add a mode toggle in the
  capture UI, and decide what a *video* capture of clothing is actually for
  (a 360° spin clip for the catalog item page? raw footage with no current
  consumer?). A video with no downstream feature is just storage cost.
- If this is really about the AR feature (#4) needing a live video feed
  rather than a snapshot, it may already be covered by that work and this
  item collapses into it.

**Open questions:** What does a *video* capture accomplish that a photo
doesn't, concretely — is this for the AR live-overlay feed, a 360° product
view, or something else? Needs an answer before scoping storage/bandwidth
(`MAX_CONTENT_LENGTH` is currently 10 MB, sized for photos) and backend
validation changes.

**Files:** `src/features/capture/CaptureClothesModal.tsx`, `src/app/(tabs)/scan.tsx`,
`backend/services/image_service.py` (upload validation currently
image-only), `backend/config.py` (`MAX_CONTENT_LENGTH`).

---

## 6. Finish wiring up YOLO ("make it working")

- [x] Status: folded into #3. Finding: YOLO *cannot* do clothing here — the
  COCO weights have no garment classes — so clothing isolation uses GrabCut.
  A real clothing-aware YOLO needs DeepFashion2-trained seg weights (open
  decision). Body-analysis YOLO is unchanged and still works.

**Request:** "i used yolo for that? make it working?"

**Current state:** YOLO is already loaded and working for **body**
analysis — `backend/services/yolo_service.py`, `pose_service.py`,
`segmentation_service.py` back the Scan flow's person-detection + pose +
segmentation (`body_analysis.py`), and `AI_TASKS.md` records this verified
working (`model_loaded: true`, all three models load in <0.2s). What is
**not** wired up is YOLO for *clothing*: `/api/analyze?kind=clothing` only
runs plain bounding-box detection today (see §3 above) — there's no
clothing classification/segmentation path feeding into capture or the
catalog.

**Proposed approach:** This item is really the backend half of #3. Once
it's clear what "make it working" refers to — plain detection already
works; segmentation/classification for the capture flow does not — fold
this into #3's work rather than treating it as separate.

**Open questions:** What specifically isn't working right now? Ask for the
exact screen/action and error observed, since the body-analysis YOLO path
is verified working end-to-end already (per `AI_TASKS.md` Phase 1/2).

---

## 7. Display the profile picture correctly

- [ ] Status: needs a concrete repro

**Request:** "i want the profile picture to display"

**Current state:** `src/features/profile/ProfileAvatar.tsx` already
resolves the avatar via `resolveMediaUrl(avatarRef, 3600)` (signed URL from
the private `avatars` bucket) and falls back to an initial letter when
there's no ref or the signed URL fails to resolve
(`ProfileAvatar.tsx:73-82`, `:129-140`). This is used consistently in
`home.tsx` (header), `profile.tsx` (hero), signup wizard, and community
posts/DMs. If it's *not* displaying somewhere specific, that's a bug in
that one call site (missing `avatarRef`, a storage policy issue, or an
expired/never-resolved signed URL) — not a missing feature.

**Proposed approach:**
- Get the exact screen where the photo isn't showing and check: is
  `avatarRef` actually set on the profile row (`user_profiles.avatar_url`)?
  Does `resolveMediaUrl` return `null` (storage/signing failure) or a URL
  that 404s (wrong bucket/path)?
- If the real ask is "move avatar delivery to Cloudinary" rather than a
  bug, that's the same work as #8 below — fold it in there instead of
  treating this as a separate display bug.

**Open questions:** Is this a bug report (picture doesn't show somewhere
specific) or a request to change the image pipeline (→ #8)? Needs the exact
repro before writing a fix.

---

## 8. Switch image delivery to Cloudinary

- [x] Status: done (avatars) — `POST /api/profile/avatar` uploads to
  Cloudinary (`services/cloudinary_service.py`) and saves the HTTPS URL on the
  profile; account deletion removes `ootdify/avatars/<uid>/`. Old Supabase
  avatar refs keep rendering (no migration, per user). Other categories still
  on Supabase Storage — migrate one at a time next.

**Request:** "use cloudinary for the images? i already have cloudinary api
in the .env"

**Current state:** Cloudinary is **not wired into any code path today**.
`backend/.env.example` has commented-out placeholder vars
(`CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`),
`backend/requirements.txt` does **not** include the `cloudinary` SDK, and
`backend/services/image_service.py` only has a doc comment naming
Cloudinary as a future home for upload logic — no actual client exists.
The privacy policy text (`en.ts`/`fil.ts`, `privacy.policy.s4.body2`)
already *describes* Cloudinary as a processor, which is currently
aspirational/inaccurate copy until this ships. Every image today goes
through Supabase Storage: public bucket for the catalog (direct HTTPS),
private buckets (`wardrobe`, `tryons`, `avatars`, `users`) via short-lived
signed URLs through `resolveMediaUrl()` (`src/shared/lib/storageUrl.ts`).

**Proposed approach:**
- Confirm the user put their real keys in `backend/.env` (service-role
  side only — Cloudinary secrets must **never** reach the Expo bundle,
  same rule as the Supabase service-role key per `AGENTS.md`).
- Add `cloudinary` to `backend/requirements.txt`; wire actual upload calls
  in `image_service.py` for the upload paths that currently write to
  Supabase Storage (wardrobe capture, avatar upload, try-on result,
  catalog ingestion).
- Decide scope: all image categories, or just one (e.g. avatars first,
  since that's also item #7)? Recommend migrating one bucket at a time
  (avatars first — smallest blast radius) rather than a big-bang swap.
- Decide on Supabase Storage's fate per category: drop entirely, or keep
  as a fallback? Existing signed-URL rows/references in the DB
  (`avatar_url`, `image_url` columns) store a *reference string* that
  `resolveMediaUrl()` currently interprets as a Supabase bucket path or a
  raw HTTP(S) URL — Cloudinary URLs are plain HTTPS, so `resolveMediaUrl`
  already has a path for "pass this straight through" (any `http`-prefixed
  ref). The real work is on the **upload** side, not the display side.
- Existing data migration: old avatars/wardrobe images already stored in
  Supabase buckets need either a one-time migration script to Cloudinary or
  to keep rendering from Supabase indefinitely alongside new Cloudinary
  uploads (mixed-source refs both already work at display time thanks to
  the http passthrough above).

**Open questions:**
- Which image categories move to Cloudinary — all, or starting with one?
- Keep Supabase Storage as a fallback/secondary, or fully replace it?
- Migrate existing stored images, or only use Cloudinary going forward?

**Files:** `backend/requirements.txt`, `backend/services/image_service.py`,
`backend/config.py` (read the Cloudinary env vars), `backend/.env.example`
(uncomment + document), upload call sites in `backend/routes/*`, possibly
`backend/scripts/ingest_fashion.py` for catalog ingestion. Frontend changes
should be minimal to none — `resolveMediaUrl()` already passes raw HTTPS
URLs through unchanged.

---

## Suggested order

Given the dependencies between items, a sensible sequence is:

1. **#8 Cloudinary** (unblocks real image URLs for everything else, smallest
   blast radius starting with avatars) → also resolves #7 if that was a
   pipeline request, not a bug.
2. **#7 Profile picture bug** (if it's a real bug, fix it standalone first —
   it's cheap and independent of #8).
3. **#3 + #6 Clothing segmentation** (one feature, backend YOLO work +
   capture UI).
4. **#5 Photo/video capture** (depends on clarifying whether it's for #4).
5. **#1 + #2 Button/header polish** (lowest risk, can happen anytime, but
   needs concrete examples from the user first).
6. **#4 AR try-on** (biggest unknown — do a feasibility spike before
   committing to a scope).
