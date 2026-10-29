# Live AR Try-On (on-device) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/tryon/live`, the selected garment follows the person on the live camera video at frame rate and is warped onto their body (shoulders/waist/hips, knees, ankles).

**Architecture:** VisionCamera v5 `useFrameOutput` runs MoveNet Lightning through react-native-fast-tflite on the camera thread. The keypoints go through a One-Euro smoother and `bodyMesh` turns them into a warped grid, which Skia draws with the garment cutout as a texture: on the frame itself (Plan A) or on a canvas over the preview (Plan B). The server snapshot loop and the `/api/tryon/live/pose` endpoint are removed.

**Tech Stack:** Expo SDK 58 dev build (Android), react-native-vision-camera 5.x + -worklets + -resizer, react-native-nitro-modules/-image, react-native-fast-tflite 3.x, @shopify/react-native-skia, react-native-worklets 0.13, Reanimated 4.7, Jest (ts-jest, node env), pytest.

**Spec:** [docs/superpowers/specs/2026-10-29-live-ar-tryon-design.md](../specs/2026-10-29-live-ar-tryon-design.md)

## Global Constraints

- Android only. The app now requires the dev build (`npx expo run:android` / EAS `development`). `expo-camera` stays for every other screen.
- Install native packages with `npx expo install <pkg>` so the versions match SDK 58.
- Model: MoveNet SinglePose Lightning int8, 192×192 uint8 RGB input, output `[1,1,17,3]` `(y, x, score)` in COCO order, at `assets/models/movenet_lightning_int8.tflite`.
- Keypoint confidence threshold: **0.3**.
- Pure units (`moveNet.ts`, `smoothing.ts`, `bodyMesh.ts`, `alphaBounds.ts`, `overlayGeometry.ts`, `liveStatus.ts`) import nothing native, start every exported function with `'worklet'` where it runs on the camera/UI thread, and are tested under `src/features/tryon/ar/__tests__/` (Jest `testEnvironment: node`, `*.test.ts` only).
- No frame or keypoint data leaves the device: no network calls in the live path.
- Every user-visible string goes in **both** `src/shared/i18n/en.ts` and `fil.ts`.
- The camera feed isn't themed: keep `ON_CAMERA`/`CAMERA_BG` in `live.tsx`, and use theme tokens for the sheet.
- One conventional commit per file (`feat|fix|refactor|test|docs|chore(scope): …`), each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never stage `src/features/profile/onboarding.ts` or `assets/images/mascot-penggi(copy).png` (the user's own pending changes).
- Before finishing: `npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors), `cd backend && .venv/Scripts/python -m pytest -q`, and `npx expo run:android` builds.

## Review Focus

1. **The tracker sees a non-person or two people:** MoveNet single-pose returns low scores. Every anchor below 0.3 must give `no_pose`, never a mesh on noise. Test: Task 4 `no_pose when a required joint is under 0.3`.
2. **A joint drops out and comes back across the frame:** the smoother must snap to the new position, not glide across the screen. Test: Task 3 `resets a joint after low confidence`.
3. **Person turned side-on (shoulder points nearly overlap):** the top-row width approaches 0, so this must be `no_pose`, not a sliver or a flipped garment. Test: Task 4 `no_pose when shoulders are closer than 2% of the frame`.
4. **Person upside down / phone held sideways (rows out of order):** never draw an inverted garment. Test: Task 4 `no_pose when hips are above shoulders`.
5. **Garment image with transparent padding or fully transparent:** the opaque box is used, and a fully transparent image falls back to the full bounds rather than a zero-size texture. Test: Task 5 `alphaBounds` cases.

---

### Task 1: Spike — native setup and Skia drawing path (throwaway UI, kept config)

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npx expo install`), `app.json` (plugins), `metro.config.js` (`assetExts` += `tflite`)
- Create: `assets/models/movenet_lightning_int8.tflite` (download from the TensorFlow Hub / Kaggle Models MoveNet SinglePose Lightning TFLite int8 page; record the source URL and license in the commit body)
- Create (throwaway, deleted at the end of the task): `src/app/tryon/spike.tsx`
- Modify: `REMAINING_TASKS.md` §3 (spike result)

**Interfaces:**
- Produces: a building dev build with all packages installed, the model asset resolvable via `require("../../../../assets/models/movenet_lightning_int8.tflite")`, and a recorded decision: **Plan A** (Skia draws on the frame) or **Plan B** (Skia `<Canvas>` over `<Camera>`), plus the frame orientation and mirroring facts for the front and back cameras.

- [ ] **Step 1:** `npx expo install react-native-vision-camera react-native-vision-camera-worklets react-native-vision-camera-resizer react-native-nitro-modules react-native-nitro-image react-native-fast-tflite @shopify/react-native-skia`. Read each package's README for config-plugin entries and add them to `app.json` (`react-native-fast-tflite` with `{ "enableAndroidGpuLibraries": true }`).
- [ ] **Step 2:** Add `tflite` to `resolver.assetExts` in `metro.config.js` and add the model file.
- [ ] **Step 3:** Run `npx expo prebuild --platform android --clean` then `npx expo run:android`. Expected: the app builds and opens on a phone. If a package's version doesn't support RN 0.88, stop and report which one and its error.
- [ ] **Step 4:** In `spike.tsx`, render the front camera, run MoveNet per frame (`useResizer({ width: 192, height: 192, channelOrder: "rgb", dataType: "uint8" })`, `model.runSync`), and draw a red dot at `left_shoulder` with `<SkiaCamera>` frame drawing. Verify on the phone: is the dot on the shoulder at frame rate? If `<SkiaCamera>` can't draw per frame, try Plan B (`<Camera>` + `<Canvas>` driven by a Reanimated shared value written from the frame worklet).
- [ ] **Step 5:** Record in `REMAINING_TASKS.md` §3: the chosen plan, the FPS seen, whether frame x/y need rotating or mirroring to match the preview for each camera, and the installed versions.
- [ ] **Step 6:** Delete `spike.tsx`. Run `npx tsc --noEmit` and `npm test`; expect both clean.
- [ ] **Step 7:** Commit `package.json`+lockfile together (one dependency commit), then `app.json`, `metro.config.js`, the model and `REMAINING_TASKS.md` one per commit (`chore(tryon): …`, `docs(tryon): …`).

### Task 2: MoveNet output parser

**Files:**
- Create: `src/features/tryon/ar/moveNet.ts`
- Test: `src/features/tryon/ar/__tests__/moveNet.test.ts`

**Interfaces:**
- Consumes: `Keypoint` from `overlayGeometry.ts`.
- Produces: `MOVENET_KEYPOINTS: readonly string[]` (17 COCO names: `nose, left_eye, right_eye, left_ear, right_ear, left_shoulder, right_shoulder, left_elbow, right_elbow, left_wrist, right_wrist, left_hip, right_hip, left_knee, right_knee, left_ankle, right_ankle`), `MOVENET_INPUT_SIZE = 192`, `parseMoveNet(output: ArrayLike<number>): Keypoint[]`.

- [ ] **Step 1: Write the failing tests**
  - `returns 17 keypoints in COCO order`: names equal `MOVENET_KEYPOINTS`.
  - `swaps (y, x, score) into x/y/confidence`: output with index 5 = `[0.2, 0.7, 0.9]` → `left_shoulder` `{ x: 0.7, y: 0.2, confidence: 0.9 }`.
  - `throws on a short output`: length 50 → throws `/51/`.
- [ ] **Step 2:** `npx jest src/features/tryon/ar/__tests__/moveNet.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement (`'worklet'`, a plain loop, no allocation beyond the result array).
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit test and source separately (`test(tryon): …`, `feat(tryon): parse MoveNet keypoints`).

### Task 3: One-Euro keypoint smoother

**Files:**
- Create: `src/features/tryon/ar/smoothing.ts`
- Test: `src/features/tryon/ar/__tests__/smoothing.test.ts`

**Interfaces:**
- Consumes: `Keypoint`, `MIN_KEYPOINT_CONFIDENCE` (0.3, now exported from `overlayGeometry.ts`, see Task 4).
- Produces: `SmootherState` (plain object, worklet-shareable), `createSmoother(): SmootherState`, `smoothKeypoints(state: SmootherState, keypoints: Keypoint[], tMs: number): Keypoint[]` (mutates `state`, returns new keypoints). Constants `MIN_CUTOFF = 1.0`, `BETA = 0.02`, `D_CUTOFF = 1.0`.

- [ ] **Step 1: Write the failing tests**
  - `passes the first sample through`: first call returns the input x/y.
  - `damps jitter on a still point`: 30 samples alternating x=0.50/0.52 at 33 ms → last 10 outputs all within `[0.505, 0.515]`.
  - `follows a fast step`: x 0.2 for 10 frames then 0.8. Within 6 frames after the step, output x > 0.7.
  - `resets a joint after low confidence`: x=0.2 conf 0.9 ×5, one frame conf 0.1, then x=0.8 conf 0.9 → that output's x === 0.8.
  - `keeps confidence unchanged`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the standard One-Euro filter (Casiez et al.) per `x` and `y` of each joint: `alpha(cutoff, dt) = 1 / (1 + 1/(2π·cutoff·dt))`, with derivative-adaptive cutoff `MIN_CUTOFF + BETA·|dx̂|`. A joint whose confidence is under 0.3 clears its filter state.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit test, then source.

### Task 4: Body mesh (replaces the rectangle placement)

**Files:**
- Create: `src/features/tryon/ar/bodyMesh.ts`
- Modify: `src/features/tryon/ar/overlayGeometry.ts`: keep the `Keypoint`, `Point`, `Size` types and `pointToPreview`. Remove `Rect`, `Anchors`, `OverlayFit`, `garmentFit`, `photoToPreview`, `PLACEMENTS`. Change `MIN_KEYPOINT_CONFIDENCE` to `0.3`. Add `'worklet'` to `pointToPreview` and `cover`.
- Test: `src/features/tryon/ar/__tests__/bodyMesh.test.ts`. Modify `__tests__/overlayGeometry.test.ts` to delete the `garmentFit`/`photoToPreview` cases and keep the `pointToPreview` cases.

**Interfaces:**
- Consumes: `Keypoint`, `Point`, `MIN_KEYPOINT_CONFIDENCE`.
- Produces:
  ```ts
  export interface Bounds { x: number; y: number; width: number; height: number } // normalized 0..1 of the image
  export type MeshFit =
    | { kind: "mesh"; vertices: Point[]; texCoords: Point[]; indices: number[] } // vertices normalized to the frame
    | { kind: "unsupported" }
    | { kind: "no_pose" };
  export const MESH_COLUMNS = 5;          // vertices per row = 6
  export const STRIPS_PER_SEGMENT = 4;
  export function isSupportedCategory(category: string | null): boolean;
  export function bodyMesh(category: string | null, keypoints: Keypoint[], garment: Bounds): MeshFit;
  ```
  `texCoords` are normalized to the garment image (0..1). The Skia layer multiplies them by the image's pixel size.

- [ ] **Step 1: Write the failing tests**, built on a `standing()` keypoint fixture (shoulders y=0.30 at x 0.40/0.60, hips y=0.60 at x 0.43/0.57, knees y=0.78, ankles y=0.95, all conf 0.9):
  - `tops: 3 anchor rows → (2·4+1)=9 rows × 6 vertices`, `indices.length === 8·5·6`, and `texCoords.length === vertices.length`.
  - `tops: top row centre is above the shoulders by 12% of torso length` (y ≈ 0.30 − 0.036) and `half-width = shoulder width × 1.45 / 2`.
  - `tops: hip row is never narrower than 85% of the top row`.
  - `rotated shoulders rotate the top row`: shoulders at (0.40,0.28)/(0.60,0.32) → top-row slope equals 0.04/0.20 within 1e-6.
  - `dresses end at the knees` / `bottoms start at the hips and end at the ankles` (last row centre y ≈ anchor y + 5% of span).
  - `texCoords span the garment bounds`: `garment = {x:0.1,y:0.2,width:0.8,height:0.6}` → min/max texCoord x = 0.1/0.9, y = 0.2/0.8.
  - `unsupported for Shoes and null`.
  - `no_pose when a required joint is under 0.3` (Review Focus 1).
  - `no_pose when shoulders are closer than 2% of the frame` (Review Focus 3).
  - `no_pose when hips are above shoulders` (Review Focus 4).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with the spec's §Fitting constants as named constants at the top of the file (`TOP_RAISE = 0.12`, `BOTTOM_DROP = 0.05`, `MIN_PAIR_WIDTH = 0.02`, and the per-category width scales 1.45 / 1.35 / 0.85 floor / 1.1 / 1.6 / leg-edge 0.25), one comment line each. For each anchor row, build left/right edge points from the row's centre ± its half-width along the pair's direction. Raise/lower the end rows along the body axis (the unit vector from the top-row centre to the bottom-row centre). Lerp `STRIPS_PER_SEGMENT` rows between consecutive anchor rows and `MESH_COLUMNS` columns across each row. Indices are two triangles per cell. "Rows out of order" means the dot product of (next centre − this centre) and the body axis is ≤ 0.
- [ ] **Step 4:** Run the two test files → PASS. Run `npx tsc --noEmit`: it will report `live.tsx`/`liveStatus.ts` using removed names. That's expected until Tasks 6–7; note the errors and continue.
- [ ] **Step 5:** Commit `bodyMesh.test.ts`, `bodyMesh.ts`, `overlayGeometry.test.ts`, `overlayGeometry.ts` one per commit.

### Task 5: Garment opaque bounds

**Files:**
- Create: `src/features/tryon/ar/alphaBounds.ts`
- Test: `src/features/tryon/ar/__tests__/alphaBounds.test.ts`

**Interfaces:**
- Produces: `alphaBounds(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, threshold = 16): Bounds` (normalized; `Bounds` from `bodyMesh.ts`).

- [ ] **Step 1: Write the failing tests**
  - `finds an inset opaque box`: 10×10 image, alpha 255 for x 2..7, y 1..8 → `{x:0.2, y:0.1, width:0.6, height:0.8}`.
  - `ignores near-transparent fringe`: alpha 10 border pixels are excluded.
  - `fully transparent → full bounds` `{0,0,1,1}` (Review Focus 5).
- [ ] **Step 2–4:** Run → FAIL, implement (a single pass over alpha bytes), run → PASS.
- [ ] **Step 5:** Commit test, then source.

### Task 6: Status keys and copy

**Files:**
- Modify: `src/features/tryon/ar/liveStatus.ts`, `src/features/tryon/ar/__tests__/liveStatus.test.ts` (rewrite), `src/shared/i18n/en.ts`, `src/shared/i18n/fil.ts`

**Interfaces:**
- Consumes: `MeshFit["kind"]`.
- Produces: `export type TrackerState = "loading" | "ready" | "failed";` and `liveStatusKey(category: string | null, fitKind: MeshFit["kind"], tracker: TrackerState, personSeen: boolean): LiveStatusKey | null`. `LiveStatusKey` = `unsupported | tracker_failed | loading | starting | no_pose.upper | no_pose.dress | no_pose.lower` (all prefixed `tryon.live.`). `personSeen` = any keypoint ≥ 0.3 in the current frame.

- [ ] **Step 1: Rewrite the tests:** priority order `unsupported` > `tracker_failed` > `loading` > `starting` (ready, `!personSeen`) > `no_pose.*` (per category, as today) > null for `mesh`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Copy, in both `en.ts` and `fil.ts`. Add `tryon.live.tracker_failed` "Live tracking isn't available on this device." and `tryon.live.loading` "Getting the live tracker ready…". Set `tryon.live.disclaimer` to "Preview only. The garment follows your body but isn't a realistic render." and `scan.footnote_live` to "The live preview fits your garment to your body as you move. It's a preview, not a realistic render." Delete `tryon.live.lost`, `tryon.live.rate_limited`, `tryon.live.signed_out`. Filipino: translate in the file's existing register.
- [ ] **Step 6:** Commit each file separately.

### Task 7: Live tracker, Skia layer and screen; remove the snapshot loop

**Files:**
- Create: `src/features/tryon/ar/useLiveTracker.ts`, `src/features/tryon/ar/LiveGarmentLayer.tsx`
- Modify: `src/app/tryon/live.tsx`
- Delete: `useLivePose.ts`, `liveLoop.ts`, `pictureSize.ts`, `GarmentOverlay.tsx`, `useGlide.ts`, `ChalkMarks.tsx`, `__tests__/liveLoop.test.ts`, `__tests__/pictureSize.test.ts`
- Modify: `src/services/aiApi.ts` (remove `LIVE_POSE_SIDE`, `LivePose`, `estimateLivePose`; keep `PoseKeypoint` only if something else imports it, else remove)

**Interfaces:**
- Consumes: `parseMoveNet`, `MOVENET_INPUT_SIZE`, `createSmoother`/`smoothKeypoints`, `bodyMesh`/`isSupportedCategory`/`Bounds`, `pointToPreview`, `alphaBounds`, `liveStatusKey`/`TrackerState`, and Task 1's plan choice and orientation facts.
- Produces:
  - `useLiveTracker({ active: boolean, facing: "front" | "back" }): { frameOutput; keypoints: SharedValue<Keypoint[] | null>; frameSize: SharedValue<Size>; tracker: TrackerState; personSeen: boolean; fitInputs }`. JS-side `tracker`/`personSeen` are pushed from the worklet at most every 250 ms via `scheduleOnRN`. For Plan A, the hook instead exposes the per-frame draw callback that `LiveGarmentLayer` provides.
  - `<LiveGarmentLayer image={SkImage} bounds={Bounds} category={string|null} keypoints={...} frameSize={...} preview={Size} mirrored={boolean} />`. It computes `bodyMesh` → `pointToPreview` per vertex → `drawVertices` with an `ImageShader` of the garment, opacity 0.95. On `no_pose` it holds the last mesh 300 ms, then fades over 200 ms (no fade with reduce motion, via `useReduceMotion`).

- [ ] **Step 1:** Delete the snapshot-loop files and the `aiApi.ts` exports listed above. `npx tsc --noEmit` now lists only `live.tsx` errors.
- [ ] **Step 2:** Write `useLiveTracker.ts`:
  - Load the model with `useTensorflowModel(require(model), [])`, with GPU delegate on Android if the spike showed it works, else CPU.
  - `useResizer({ width: 192, height: 192, channelOrder: "rgb", dataType: "uint8" })`.
  - In `useFrameOutput({ pixelFormat: "rgb" | per spike, onFrame })`: `try { resize → runSync → parseMoveNet → apply Task 1's orientation/mirror correction → smoothKeypoints → keypoints.value = … } catch { errorStreak++ } finally { resized?.dispose(); frame.dispose(); }`.
  - 30 consecutive errors or model state `error` → `tracker = "failed"` and one `console.warn`.
- [ ] **Step 3:** Write `LiveGarmentLayer.tsx` per the chosen plan. Load the garment with Skia `useImage(uri)`. Compute `bounds` once with `alphaBounds` on `image.readPixels(0, 0, info)` of the image scaled to ≤128 px (use full bounds while it's loading).
- [ ] **Step 4:** Rewrite `live.tsx`:
  - Swap `expo-camera` for VisionCamera (`useCameraDevice(facing)`, `useCameraPermission`, `<Camera isActive={focused && appActive} outputs={[frameOutput]} />`), and keep the `useAppActive` helper (move it in from `useLivePose.ts`).
  - Keep the existing sheet, buttons, back/flip, permission grant, iOS announce and `goBack` logic.
  - Status comes from `liveStatusKey(category, fitKind, tracker, personSeen)`. `fitKind` is pushed from the worklet with the same 250 ms throttle.
  - Update the file header comment to describe on-device tracking.
- [ ] **Step 5:** `npx tsc --noEmit` clean, `npm test` green, `npm run lint` 0 errors.
- [ ] **Step 6:** `npx expo run:android`, then on the phone: a top lands on shoulders→hips and rotates when leaning, standing still doesn't jitter, the front camera isn't mirrored to the wrong side.
- [ ] **Step 7:** Commit: one commit per deleted file (`refactor(tryon): remove …`), then `aiApi.ts`, `useLiveTracker.ts`, `LiveGarmentLayer.tsx`, `live.tsx`.

### Task 8: Remove the backend live pose endpoint

**Files:**
- Modify: `backend/routes/pose.py` (delete `live_pose` and its route and docstring line 4; drop `live_limits` from the import), `backend/services/ratelimit.py` (delete `live_limits`), `backend/config.py` (delete `LIVE_POSE_IMAGE_SIZE`, `RATE_LIMIT_LIVE_MAX`, `RATE_LIMIT_LIVE_WINDOW`), `backend/.env.example` (delete those three and the comment line)
- Delete: `backend/tests/test_live_pose_route.py`

- [ ] **Step 1:** `grep -rn "live_pose\|live_limits\|LIVE_POSE\|RATE_LIMIT_LIVE" backend --include=*.py --include=*.example` (excluding `.venv`) → only the lines above.
- [ ] **Step 2:** Make the deletions.
- [ ] **Step 3:** `cd backend && .venv/Scripts/python -m pytest -q` → all pass, and the same grep → no output.
- [ ] **Step 4:** One commit per file (`refactor(backend): remove the live pose endpoint`, …).

### Task 9: Docs and phone checklist

**Files:**
- Modify: `REMAINING_TASKS.md` §3, `README.md` (dev build requirement, if it describes running in Expo Go)

- [ ] **Step 1:** Rewrite §3 for the on-device design: link the spec and this plan, keep the spike result, and replace the checklist with the spec's §Testing phone checklist. Remove the Railway `RATE_LIMIT_LIVE_*` / `LIVE_POSE_IMAGE_SIZE` line and the "Smooth ~30 fps … out of scope" note.
- [ ] **Step 2:** If `README.md` tells people to use Expo Go, change it to `npx expo run:android` / EAS `development`.
- [ ] **Step 3:** Run the full verification (Global Constraints, last line) and report each result.
- [ ] **Step 4:** One commit per file (`docs(tryon): …`, `docs(readme): …`).
