# Live AR Try-On (on-device) — Design

**Date:** 2026-10-29
**Replaces:** the snapshot-based live overlay from
[plans/2026-10-27-live-tryon-overlay.md](../plans/2026-10-27-live-tryon-overlay.md)
(`REMAINING_TASKS.md` §3).

## Intent

**Asked:** "I want it to be accurate, like an AR — the image shows on the video
and fits the body of the person."

**Agreed outcome:** on `/tryon/live`, the selected garment follows the person on
the live camera video at camera frame rate (target ~30 fps on a mid-range
Android phone), and is warped so it sits on the body: top edge on the shoulders,
sides following the torso, rotating when the person leans or turns slightly.

**Decided with the user:**
- On-device pose (no server round trip per frame); a dev build is acceptable.
- Android only for now (matches `eas.json`).
- Approach A: VisionCamera v5 frame output + react-native-fast-tflite (MoveNet)
  + Skia drawing a warped garment mesh.
- The user delegated the remaining design choices ("decide what is the best
  outcome, I approve it"); those choices are marked **Decision** below.

**Not in scope (stated on screen):** cloth physics, 3D garments, side views,
arms or hands passing in front of the garment (the garment is always drawn on
top). The Scan photo try-on stays the realistic result.

## Success criteria

1. With a supported garment and the person's anchor joints in view, the garment
   is drawn on every rendered frame, with no visible lag between body and
   garment (Plan A), or at most one frame (Plan B, see Rendering).
2. Garment top corners stay on the shoulders and bottom corners on the hips
   (tops) / knees (dresses) / ankles (bottoms) within roughly 5% of body width
   while the person moves slowly.
3. Standing still, the garment does not visibly jitter.
4. Front camera: the garment is on the person, not mirrored to the other side.
5. No camera frame or pose data leaves the device.

## Dependencies

Installed with `npx expo install` (pins SDK-58-compatible versions):

| Package | Role |
|---|---|
| `react-native-vision-camera` 5.x | camera + per-frame `useFrameOutput` |
| `react-native-vision-camera-worklets` | frame output worklet runtime (uses the existing `react-native-worklets` 0.13) |
| `react-native-vision-camera-resizer` | frame → 192×192 RGB uint8 |
| `react-native-nitro-modules`, `react-native-nitro-image` | VisionCamera v5 peers |
| `react-native-fast-tflite` 3.x | runs MoveNet in the frame worklet (`runSync`) |
| `@shopify/react-native-skia` | draws the warped garment |

- Model: **MoveNet SinglePose Lightning (int8 TFLite, 192×192, Apache-2.0)** in
  `assets/models/movenet_lightning_int8.tflite`. Output `[1,1,17,3]` as
  `(y, x, score)` in COCO keypoint order, the same names the app already uses
  (`left_shoulder`, …).
- `metro.config.js` adds `tflite` to `resolver.assetExts`; `app.json` adds the
  `react-native-fast-tflite` plugin (`enableAndroidGpuLibraries: true`) and any
  plugin VisionCamera v5 needs.
- **Consequence:** the app requires the dev build (`npx expo run:android` or
  EAS `development` profile). Expo Go can no longer open it.
- `expo-camera` stays: Scan, capture and profile photo still use it.

## Architecture

```
Camera frame (camera thread)
  └─ resizer.resize(frame) → 192×192 rgb uint8
  └─ model.runSync()       → Float32 [17×3]
  └─ parseMoveNet()        → Keypoint[] (normalized to the frame, 0..1)
  └─ smoother.apply()      → steadier Keypoint[]   (One-Euro filter)
  └─ shared value          → read by the Skia draw step
Skia draw (per frame)
  └─ bodyMesh(category, keypoints) → mesh vertices (normalized) or "no_pose"
  └─ toScreen(vertices)            → preview pixels (cover crop, mirror)
  └─ drawVertices(vertices, texCoords, garment image shader)
JS thread (throttled to ~4 Hz)
  └─ fit kind / tracker state → status line in the bottom sheet
```

### Rendering — Plan A, with a fallback

- **Plan A:** draw the garment onto the camera frame itself in the Skia frame
  path (VisionCamera v5 `<SkiaCamera>` / Skia frame drawing). Body and garment
  come from the same frame, so there is no lag.
- **Plan B:** if v5's Skia path cannot draw custom content per frame on this
  setup, render the normal `<Camera>` preview with a Skia `<Canvas>` on top,
  driven by a Reanimated shared value updated from the frame worklet (≤1 frame
  of lag).
- **Decision:** the first implementation task is a throwaway spike on a real
  phone that confirms Plan A, or falls back to Plan B, and confirms the
  VisionCamera v5 frame orientation for front and back cameras. Its result is
  recorded in `REMAINING_TASKS.md` §3 before the rest is built.

## Units (all in `src/features/tryon/ar/`)

Pure TypeScript units are worklet-safe (`'worklet'` directive, no closures over
non-serializable values) and unit-tested in Jest.

| File | Purpose |
|---|---|
| `moveNet.ts` | `parseMoveNet(output: Float32Array \| number[]): Keypoint[]`: 17 named keypoints, `(y,x,score)` → `{name, x, y, confidence}` |
| `smoothing.ts` | One-Euro filter per keypoint coordinate. `createSmoother()` state + `smoothKeypoints(state, keypoints, tMs)`. Resets a joint when its confidence drops below the threshold, so a re-found joint doesn't slide in from its old place |
| `bodyMesh.ts` | `bodyMesh(category, keypoints, garmentBounds) → { kind: "mesh", vertices, texCoords, indices } \| { kind: "unsupported" } \| { kind: "no_pose" }` (see Fitting) |
| `alphaBounds.ts` | Bounding box of the garment cutout's opaque pixels (alpha > 16), computed once on the JS thread from a small (≤128 px) readback of the image, so transparent padding isn't stretched onto the body |
| `overlayGeometry.ts` | Keep the `Keypoint`/`Point`/`Size` types and the cover-crop + mirror mapping (`pointToPreview`). Remove the rectangle placement (`garmentFit`, `photoToPreview`), which `bodyMesh` replaces |
| `useLiveTracker.ts` | Owns the model, resizer and `useFrameOutput`. Exposes the shared keypoints value plus a throttled JS-side `{ tracker: "loading" \| "ready" \| "failed", fit kind }` |
| `LiveGarmentLayer.tsx` | The Skia drawing (Plan A or B) |
| `liveStatus.ts` | Rewritten for the new states (below) |

**Removed** (nothing calls them once the screen is on-device):
- App: `useLivePose.ts`, `liveLoop.ts`, `pictureSize.ts`, `GarmentOverlay.tsx`,
  `useGlide.ts`, `ChalkMarks.tsx` (the warped garment itself shows the fit), their
  tests, and `estimateLivePose` / `LivePose` / `LIVE_POSE_SIDE` in `aiApi.ts`.
- Backend: `POST /api/tryon/live/pose` in `routes/pose.py`, `live_limits` in
  `services/ratelimit.py`, `LIVE_POSE_IMAGE_SIZE` / `RATE_LIMIT_LIVE_*` in
  `config.py` and `.env.example`, and `tests/test_live_pose_route.py`.
  **Decision:** remove it rather than keep a dead endpoint and its rate limit.
- Kept: `liveGarmentStore.ts` (the Scan → live hand-off) and the `/tryon/live` route.

## Fitting (`bodyMesh`)

**Confidence:** a keypoint counts when `confidence ≥ 0.3` (MoveNet's scores run
lower than YOLO's, so not the old 0.4).

**Anchor rows** (each row is a left/right point pair taken from the keypoints):

| Category | Rows top → bottom | Width set by |
|---|---|---|
| tops, outerwear | shoulders, waist (40% of the way from hips to shoulders), hips | shoulder width × 1.45 at the top row; hip width × 1.35 at the hip row, but never narrower than 85% of the top row |
| dresses | shoulders, hips, knees | as tops; knee row = hip-row width × 1.1 |
| bottoms | hips, knees, ankles | hip width × 1.6; knee and ankle rows keep the outer edge of the legs (outer knee/ankle points + 25% of hip width) |
| others | — | `unsupported` |

**Building the mesh:**
- Each row's centre is the midpoint of its pair. Its direction is along the pair
  (so the garment rotates with the shoulders or hips), and its half-width comes
  from the table.
- The top row is raised by 12% of the torso length along the body's up direction
  (perpendicular to the shoulder line) to cover the collar. The bottom row is
  lowered by 5%.
- The garment is split into a **5 columns × (rows−1)×4 strips** grid. Between
  anchor rows, vertices are linearly interpolated, so the garment bends at the
  waist or knees instead of staying one rectangle.
- Texture coordinates map the same grid uniformly over `garmentBounds`
  (from `alphaBounds`).
- Returns `no_pose` if any required pair is missing, the rows are not in
  top-to-bottom order along the body axis, or a width is ≤ 0. A degenerate or
  flipped mesh is never drawn.
- The constants live at the top of `bodyMesh.ts` with a one-line note each, for
  tuning on a phone.

**Mirroring:** the front-camera preview is mirrored. Vertices go through the
existing cover-crop + mirror mapping. The garment texture is *not* flipped
(the garment's left side stays on the person's left side), which matches what a
mirror shows.

**Hold and fade:** when the fit becomes `no_pose`, keep drawing the last mesh for
300 ms (a missed frame shouldn't flash), then fade it out over 200 ms.
Reduce-motion: no fade, hide at once.

**Opacity:** 0.95 while tracking (a hint of the body underneath reads as
"try-on", not a sticker).

## Status line

`liveStatusKey(category, fitKind, tracker)`, most important first:

| Key | When | English |
|---|---|---|
| `tryon.live.unsupported` | category not supported | (unchanged) |
| `tryon.live.tracker_failed` | model failed to load, or frame output errored | "Live tracking isn't available on this device." |
| `tryon.live.loading` | model loading | "Getting the live tracker ready…" |
| `tryon.live.starting` | ready, no person found yet | (unchanged) |
| `tryon.live.no_pose.*` | person found, anchors missing | (unchanged) |
| null | garment placed | — |

- Removed keys: `tryon.live.lost`, `tryon.live.rate_limited`,
  `tryon.live.signed_out`.
- Disclaimer becomes: "Preview only. The garment follows your body but isn't a
  realistic render."
- All strings go in both `en.ts` and `fil.ts`. Update `scan.footnote_live` the
  same way.

## Error handling

- Model load failure (`useTensorflowModel` state `error`) → `tracker_failed`,
  logged with `console.warn` once. No retry loop.
- Frame worklet exceptions are caught per frame: the frame is disposed and
  counted, and 30 consecutive errors → `tracker_failed`.
- `frame.dispose()` and `resized.dispose()` always run (`try/finally`).
- Camera permission: VisionCamera's `useCameraPermission`, with the same grant
  button and copy as today.
- Leaving the screen or backgrounding the app stops the camera
  (`isActive = focused && appActive`), which stops frame output.

## Privacy

Frames and keypoints stay in memory on the device and are never uploaded or
stored. The backend consent gate (`@require_consent`) no longer applies to the
live preview because nothing is sent. Update the camera-permission copy only if
it mentions the server for live preview (it doesn't today).

## Testing

**Jest** (the tested units are pure TypeScript and import nothing native, so
no mocks are needed; Jest stays `testEnvironment: node`):
- `parseMoveNet`: order, names, (y,x) swap.
- One-Euro: converges on a still point, follows a fast step within a bounded
  lag, resets a joint after low confidence.
- `bodyMesh`: for each category, rotated shoulders → rotated top row; missing or
  low-confidence joints → `no_pose`; inverted rows → `no_pose`; unsupported
  category; vertex/texCoord/index counts consistent.
- `alphaBounds`: opaque inset box, fully transparent image → full bounds.
- `pointToPreview`: keep the existing cover-crop/mirror tests.
- `liveStatusKey`: priority order.
- Backend: removing the endpoint deletes its test file; the remaining pytest
  suite stays green.

**Phone checklist** (replaces `REMAINING_TASKS.md` §3's list): the spike result;
front and back camera; a top, a dress and bottoms each on the right span;
leaning and turning slightly rotates the garment; standing still doesn't jitter;
stepping partly out of frame → "Step back…" then the garment fades; airplane
mode changes nothing; leaving the screen turns off the camera indicator.

## Verification

`npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors),
`cd backend && .venv/Scripts/python -m pytest -q`, and a successful
`npx expo run:android` build.
