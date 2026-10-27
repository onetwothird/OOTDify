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

## 3. AI live try-on — FEATURE_GUIDE #4 (not started in code)

Decided: **live 2D overlay** (not true 3D AR). Research done; nothing written yet.

- Pose model returns 17 COCO keypoints (`backend/services/pose_service.py`,
  `KEYPOINT_NAMES`), ~30–50 ms/frame at 320 px on CPU → expect ~1–2 overlay
  updates/sec over the network.
- **Backend:** new stateless endpoint, e.g. `POST /api/tryon/live/pose`
  (`require_auth` + `require_consent`), runs pose at 320 px, returns only
  normalized keypoints, stores nothing. Needs its **own rate limit**
  (e.g. 240/min) — `/api/pose` uses `upload_limits` (15/hour) and would block a
  live loop within seconds.
- **App:** new screen (e.g. `src/app/tryon/live.tsx` + `src/features/tryon/ar/`):
  - `CameraView` + a loop of `takePictureAsync({ quality: 0.3, shutterSound: false })`
    → shrink to ~480 px → POST → keypoints.
  - Draw the garment image (`expo-image`, absolutely positioned, animated between
    updates). Tops/outerwear/dresses: shoulders → hips (dresses → knees);
    bottoms: hips → ankles; shoes/bags/accessories: show "not supported yet".
  - Front camera: preview is mirrored but the photo is not → flip x.
  - Map photo coords to the preview with the same "cover" crop the preview uses.
  - Label it honestly as a preview ("placed on your pose points, not a
    realistic render"). The existing async photo try-on stays for final results.
- Entry points: Scan screen (selected garment) and/or catalog/wardrobe item "Try it on".
- Smooth ~30 fps tracking would need on-device pose (vision-camera frame
  processors + a TFLite/MediaPipe model) → a dev build, not Expo Go. Out of scope for v1.

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
