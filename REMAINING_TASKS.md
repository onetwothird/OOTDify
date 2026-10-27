# OOTDify — Remaining Tasks

> Hand-off notes so work can resume later. Last updated 2026-10-27.
> The detailed plan for each feature lives in [FEATURE_GUIDE.md](./FEATURE_GUIDE.md);
> repo rules live in [AGENTS.md](./AGENTS.md).

## Where things stand

| Branch | State |
|---|---|
| `main` | Cloudinary avatars, garment cut-out on capture, try-on worker fixes, request logging, Expo SDK 58 upgrade |
| `fix/settings-dark-mode-uploads` | Pushed, **not merged yet**: Settings screen, dark-mode fixes, photo shrinking before upload, About screen redesign |

Verification on that branch: `npx tsc --noEmit` clean, `npm test` 44/44, backend
`pytest` 80/80, Android bundle builds (`npx expo export --platform android`).
Not yet checked on a real phone.

## 1. Merge and check the open branch

- [ ] Open a PR for `fix/settings-dark-mode-uploads` → `main` and merge it.
- [ ] On a phone (restart with `npx expo start -c`, Expo Go updated for SDK 58):
  - [ ] Home → gear button opens **Settings** (not Home).
  - [ ] Switch Appearance to **Dark** and walk every tab, Profile, sign-in,
        chat, catalog item, About. Nothing should be white-on-white.
  - [ ] Settings → About: Updates / What's New / Feedback / Trademarks tabs look right.
  - [ ] **Scan → Choose photo** and **Scan → Scan me** both succeed.

## 2. Confirm the Scan failure is really fixed

The suspected cause (photos over the backend's 10 MB limit, which React Native
reports as a network error) is fixed by shrinking photos to 1600 px before upload
(`src/shared/lib/shrinkImage.ts`). It was **not reproduced end to end**: that
needs a signed-in request.

- [ ] If Scan still fails: note the exact on-screen message, then copy the raw
      Railway log lines from that moment. The access log now prints every request
      (`"POST /api/body-photos ..." <status> ... <duration>us`).
  - No request line → the phone never reached Railway (connection/app side).
  - `413` → still too large; lower `MAX_UPLOAD_SIDE` or raise `MAX_CONTENT_LENGTH`.
  - `500` → paste the traceback that follows it.

## 3. AI live try-on — FEATURE_GUIDE #4 (built on `feat/live-tryon`, not checked on a phone)

Live **2D overlay**, built per
[docs/superpowers/plans/2026-10-27-live-tryon-overlay.md](./docs/superpowers/plans/2026-10-27-live-tryon-overlay.md).
Scan → select exactly one garment → **Try it live** opens `/tryon/live`: full-screen
camera, the garment hung from your pose points (chalk ticks show which ones),
about 1–2 updates per second. The photo try-on stays the real result.

- **Backend:** `POST /api/tryon/live/pose`. Stateless, pose at 320 px, nearest
  person only, keypoints normalized 0..1, its own limit (240/min).
- **App:** `src/features/tryon/ar/` (geometry, loop, status, overlay, chalk marks)
  and `src/app/tryon/live.tsx`. Tops/outerwear: shoulders → hips; dresses → knees;
  bottoms: hips → ankles; shoes/bags/accessories say "not supported".
- Verified: `tsc` clean, Jest 95/95, backend pytest 91/91, lint 0 errors,
  Android bundle builds.

- [ ] On a phone (`npx expo start -c`), signed in:
  - [ ] Front camera: the garment sits on you, not mirrored to the other side.
  - [ ] Back camera (someone else in frame): same.
  - [ ] A top, a dress and a pair of bottoms each land on the right body span.
  - [ ] A shoe shows "Live preview works with tops, outerwear, dresses and bottoms."
  - [ ] Walk partly out of frame → "Step back so your … are in view."
  - [ ] Airplane mode → garment fades, "Connection lost. Retrying…"; back online recovers.
  - [ ] Leave the screen → Railway access log stops showing `/api/tryon/live/pose`.
  - [ ] Tune the garment proportions in `overlayGeometry.ts` (width ×1.5, 12% above
        the top anchors) if it looks too wide or short.
- [ ] Railway (optional; defaults apply): `RATE_LIMIT_LIVE_MAX=240`,
      `RATE_LIMIT_LIVE_WINDOW=60`, `LIVE_POSE_IMAGE_SIZE=320`.
- Smooth ~30 fps tracking would need on-device pose (vision-camera frame
  processors + a TFLite/MediaPipe model), which means a dev build, not Expo Go.
  Out of scope for v1.

## 3b. Closet-first app (built on `feat/closet-first`, not checked on a phone)

The stock catalog is gone from every screen. Everything runs on the clothes you
capture (background removed on capture, `FEATURE_GUIDE.md` §3). Plan:
[docs/superpowers/plans/2026-10-27-closet-first.md](./docs/superpowers/plans/2026-10-27-closet-first.md).

- **Backend:** `/api/recommend` and `/api/outfits` score and compose the signed-in
  user's `clothing_items` (`catalog_service.load_closet_candidates`).
- **Home:** Recommended shows your clothes; Trending and Recently viewed removed.
- **Wardrobe tab (Discover):** your closet only; catalog browsing removed.
- **Outfits tab / AI picker:** looks from your closet, with a "Capture clothes"
  prompt when it's too small.
- **Scan:** your clothes only, and **Try it live** is the main action. The photo
  try-on is hidden (`PHOTO_TRYON_AVAILABLE = false` in
  `src/features/tryon/config.ts`) until a real model is implemented in
  `VTONProvider.generate()`.
- **Kept on purpose:** the `clothing` table, ingestion script and
  `src/app/catalog/[id].tsx`, so outfits saved from catalog pieces still open.
- **Not changed:** the privacy policy and terms still mention catalog browsing.
  Update that legal copy if you want it to match.

- [ ] On a phone, signed in:
  - [ ] With an empty closet: Home, Wardrobe, Outfits, AI picker and Scan each
        offer "Capture clothes", not an error.
  - [ ] Capture a top, bottoms and shoes: Home suggests them; AI picker builds a look;
        Outfits builder saves it and the saved look shows thumbnails.
  - [ ] An outfit saved earlier from catalog pieces still shows its pieces.
  - [ ] Wardrobe search and category chips filter your clothes.
  - [ ] Item page → **Try it live** opens the live preview with that garment.

## 4. Waiting on your input (FEATURE_GUIDE)

- [ ] **#1 Button positioning** — which screens look awkward? (screenshots help)
- [ ] **#2 Header redesign** — more visual weight (icons/colour) or more info?
      A reference/mockup before changing the shared `ScreenHeader`.
- [ ] **#5 Video capture** — what is video for (360° item view, AR feed, other)?
- [ ] **#7 Profile picture** — does it still fail to show anywhere since the
      Cloudinary switch? If so, which screen.

## 5. Smaller follow-ups

- [ ] **Cloudinary for other images** — only avatars use it now. Next candidates,
      one at a time: wardrobe photos, try-on results, catalog ingestion
      (`backend/services/cloudinary_service.py`).
- [ ] **Clothing-aware YOLO** — garment cut-out uses OpenCV GrabCut because the
      bundled YOLO weights know no clothing classes. A DeepFashion2-trained seg
      model would add garment type + multi-item support (needs a weights file).
- [ ] **Try-on model** — `TRYON_MODEL_PATH` is empty, so every try-on job fails
      honestly with "model not configured". Plug a real VTON model into
      `VTONProvider.generate()` in `backend/services/tryon_service.py`.
- [ ] **Railway variables** — confirm `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
      `CLOUDINARY_API_SECRET` are set; do **not** set `FLASK_PORT` there.
- [ ] Install the GitHub CLI (`winget install GitHub.cli`, then `gh auth login`)
      so PRs can be opened from the terminal.
- [ ] `RAILWAY_LOGS.md` in the repo root is untracked scratch — delete or keep
      out of git.

## Gotchas learned

- After adding/renaming a route, typed routes only regenerate on
  `npx expo start` — `tsc` reports the new path as invalid until then.
- RN 0.88 types a `ScrollView` ref as `ScrollViewInstance` (import from
  `react-native`), not `ScrollView`.
- Theme colours must be 6-digit hex (enforced by `theme.test.ts`); blend
  translucent tints onto their background instead of using `rgba(...)`.
- In dark mode `primary` is near-white — never hard-code white on a `primary`
  fill; use `onPrimary` / `onPrimaryMuted` / `onPrimarySubtle` / `onPrimaryFaint`.
