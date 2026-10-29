# Try-On Cut-Outs, Smooth Live AR, Framing Guide and AI Photo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/tryon/live`, three things happen in order:
- the garment cut-out, with no background, follows the person smoothly on live video;
- a framing guide tells them where to stand;
- "Take photo" produces a realistic FASHN try-on.

**Architecture:**
- **Cut-outs.** The backend makes a transparent PNG from each closet item; the app caches it. The on-device tracker (Tasks 1-6 and 8 of the earlier plan, already done) warps the cut-out onto the body with Skia.
- **Framing.** A pure framing unit turns the keypoints into one hint.
- **AI photo.** "Take photo" reuses the existing body-photo upload and try-on job pipeline. Its provider boundary gets a FASHN implementation.

**Tech Stack:**
- App: Expo SDK 58 dev build (Android), VisionCamera 5.2.3 plus its resizer, react-native-fast-tflite, @shopify/react-native-skia 2.14, Reanimated 4.7, Jest.
- Backend: Flask, OpenCV and Pillow, `requests`, pytest.

**Spec:** [docs/superpowers/specs/2026-10-29-tryon-cutout-framing-photo-design.md](../specs/2026-10-29-tryon-cutout-framing-photo-design.md). It extends [2026-10-29-live-ar-tryon-design.md](../specs/2026-10-29-live-ar-tryon-design.md).

**Supersedes:** Tasks 7 and 9 of [2026-10-29-live-ar-tryon.md](2026-10-29-live-ar-tryon.md). Their content is folded into Tasks 4 and 8 below. Tasks 1-6 and 8 there are done.

**Build order (user):**
1. Cut-out: Tasks 1-2.
2. Smooth live try-on: the phone gate, then Task 4.
3. Framing: Tasks 3 and 5.
4. FASHN: Tasks 6-7.
5. Docs: Task 8.

Task 3 is a pure unit with no UI, so it may run before the phone gate.

## Global Constraints

- Android only. The dev build is required (`npx expo run:android` / EAS `development`).
- Local builds run from `C:\o` and target arm64 only (`-PreactNativeArchitectures=arm64-v8a` or `ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a`), because of Windows MAX_PATH.
- Keypoint confidence threshold: **0.3** (`MIN_KEYPOINT_CONFIDENCE` in `overlayGeometry.ts`).
- Pure units in `src/features/tryon/ar/`:
  - they import nothing native;
  - every exported function starts with `'worklet'`;
  - they are tested in `src/features/tryon/ar/__tests__/*.test.ts` (Jest node env).
- No frame or keypoint data leaves the device. The only uploads are the explicit "Take photo" photo and the backend reading item images by id.
- `FASHN_API_KEY` exists only in `backend/.env` and is never logged, returned, or put in an `EXPO_PUBLIC_*` variable. `FASHN_MODEL` defaults to `tryon-v1.6`.
- The backend derives the user from the session token. A cut-out or try-on for an item the caller does not own and that isn't in the shared catalog is a 404.
- Every user-visible string goes in **both** `src/shared/i18n/en.ts` and `fil.ts`, using the exact English from the spec.
- Camera chrome uses fixed colours: `ON_CAMERA = "#FFFFFF"`, `CAMERA_BG = "#000000"`, and the framing-good green `#3DDC84`. The sheet uses theme tokens.
- Animations in React components use React Native `Animated`. Skia/worklet drawing may use Reanimated shared values.
- Commits:
  - one conventional commit per file (`feat|fix|refactor|test|docs|chore(scope): …`);
  - each message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - never stage `src/features/profile/onboarding.ts`, `assets/images/mascot-penggi(copy).png` or `src/app/tryon/spike.tsx`. Task 4 deletes the spike.
- Before finishing: `npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors), `cd backend && .venv/Scripts/python -m pytest -q`.

## Review Focus

1. **Cut-out for someone else's item id.** It must 404, not leak their image. Test: Task 1 `test_cutout_other_users_item_is_404`.
2. **Item photo replaced after it was cached.** The stale cut-out must not show; a new `image_url` means a new fetch. Test: Task 2 `refetches when image_url changes`.
3. **Front camera mirror.** "Move left" must mean the user's left on the mirrored preview, not the sensor's. Test: Task 3 `move hints use the mirrored preview`.
4. **A FASHN failure or a bad key.** The job fails honestly, and the key never appears in errors or logs. Test: Task 6 `test_key_never_in_error_or_logs`.
5. **"Take photo" tapped twice, or tapped while uploading.** Exactly one job is created. Test: Task 7 `ignores a second tap while uploading`.

---

### Task 1: Transparent garment cut-out on the backend

**Files:**
- Modify: `backend/services/garment_isolation.py` (`_compose`, `IsolationResult`, `isolate_garment`)
- Create: `backend/routes/cutout.py`
- Modify: `backend/app.py` (register the blueprint)
- Test: `backend/tests/test_garment_isolation.py` (add cases), `backend/tests/test_cutout_route.py` (new)

**Interfaces:**
- Produces:
  - `isolate_garment(image_path, parser=None, *, transparent: bool = False) -> IsolationResult`, where `IsolationResult.png: bytes | None` is set when `transparent`.
  - `GET /api/clothing/<item_id>/cutout` returns `200 {success: true, cutout: {ok: bool, reason: str|null, png_base64: str|null, width: int|null, height: int|null}}`, or 404 `{success: false, error}`.

- [ ] **Step 1: Write the failing tests.**
  - `test_compose_transparent_is_rgba_png_with_clear_corners`. A synthetic RGB image with a centred square mask goes through `_compose(rgb, mask, transparent=True)`. Assert:
    - the bytes start with the PNG signature;
    - `Image.open(...).mode == "RGBA"`;
    - the alpha at pixel (0,0) is 0;
    - the alpha at the centre is 255.
  - `test_isolate_transparent_keeps_default_jpeg_path`: without the flag, `jpeg` is set and `png` is None.
  - `test_cutout_own_item_returns_png`.
  - `test_cutout_catalog_item_returns_png`.
  - `test_cutout_other_users_item_is_404`.
  - `test_cutout_failed_isolation_returns_ok_false_without_image`.
  - `test_cutout_requires_auth`.

  Mock the Supabase rows, `_resolve_image_bytes` and `isolate_garment` the way `tests/test_isolate_route.py` and `tests/test_tryon_service.py` do.
- [ ] **Step 2:** `cd backend && .venv/Scripts/python -m pytest tests/test_garment_isolation.py tests/test_cutout_route.py -q` → FAIL.
- [ ] **Step 3: Implement.**
  - `_compose(rgb, mask, transparent=False)`. When `transparent`, output an RGBA PNG using the existing Gaussian-blurred mask × 255 as alpha, with the same crop, padding and `OUTPUT_MAX_SIDE` thumbnail. Otherwise output the current white JPEG.
  - Thread `transparent` through `_clothing_only` and the GrabCut path.
  - The route lives in `cutout_bp` with `@require_auth`, `@upload_limits("cutout")` and `@require_consent`.
  - Ownership uses the same two queries as `TryOnPipeline._resolve_clothing_refs`:
    - catalog `clothing` by id;
    - else `clothing_items` by id plus `user_id`;
    - else 404.
  - Fetch the bytes with `tryon_service._resolve_image_bytes`, write them to a temp file under `Config.UPLOAD_FOLDER`, run `isolate_garment(..., transparent=True)`, and delete the temp file in `finally`.
  - Never return exception text.
- [ ] **Step 4:** Same command → PASS. Then run the full `pytest -q` → all pass.
- [ ] **Step 5:** Commit one file per commit: the two test files, `garment_isolation.py`, `routes/cutout.py`, `app.py`.

### Task 2: App cut-out loader with cache

**Files:**
- Modify: `src/services/aiApi.ts` (add `getClothingCutout`)
- Create: `src/features/tryon/cutout.ts`
- Test: `src/features/tryon/__tests__/cutout.test.ts`

**Interfaces:**
- Consumes: Task 1's route.
- Produces:
  - `getClothingCutout(itemId: string): Promise<{ ok: boolean; reason: IsolationReason | null; png_base64: string | null; width: number | null; height: number | null }>`
  - `type CutoutOutcome = { status: "ready"; uri: string; width: number; height: number } | { status: "failed"; reason: IsolationReason | null } | { status: "error" }`
  - `getGarmentCutout(item: { id: string; image_url: string }): Promise<CutoutOutcome>`
  - `cutoutFileName(itemId: string, imageUrl: string): string`, which returns `cutout-<itemId>-<hash>.png`. The hash is a short stable string hash (e.g. FNV-1a, in hex) of `imageUrl`.

- [ ] **Step 1: Write the failing tests.** Mock `aiApi` and `expo-file-system` (`File`, `Paths`) the way the existing `src/features/capture` tests do. If those tests don't exist, use `jest.mock` factories.
  - `same item and url give the same file name`.
  - `refetches when image_url changes`: a different url gives a different name, and the API is called again.
  - `reuses a cached file without calling the API`.
  - `writes the PNG and returns ready`.
  - `returns failed with the reason when ok is false`.
  - `returns error when the request throws`, with no throw escaping.
- [ ] **Step 2:** `npx jest src/features/tryon/__tests__/cutout.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
  - `getClothingCutout` goes through `apiRequest` (error-aware, `ApiError`).
  - `getGarmentCutout`:
    - if the cached file exists, return `ready` using the size stored in the name's sidecar, or read the size through Skia later. Simplest is to also write `<name>.json` with `{width,height}`;
    - otherwise call the API, write the base64 PNG, and return `ready`.
- [ ] **Step 4:** Same command → PASS. Then `npx tsc --noEmit` and `npm test`.
- [ ] **Step 5:** Commit: the test file, `aiApi.ts`, `cutout.ts`.

### Task 3: Framing hint (pure unit)

**Files:**
- Modify: `src/features/tryon/ar/bodyMesh.ts` (export the category → kind lookup)
- Create: `src/features/tryon/ar/framing.ts`
- Test: `src/features/tryon/ar/__tests__/framing.test.ts`

**Interfaces:**
- Consumes: `Keypoint`, `MIN_KEYPOINT_CONFIDENCE`.
- Produces:
  - from `bodyMesh.ts`: `export type GarmentKind = "upper" | "dress" | "bottom"` and `export function garmentKind(category: string | null): GarmentKind | null`. It is case-insensitive and uses an own-key lookup, so `"constructor"` gives null. `isSupportedCategory` becomes `garmentKind(c) !== null`.
  - `export type FramingHint = "no_person" | "step_back" | "come_closer" | "move_left" | "move_right" | "good"`
  - `export const SAFE_X = 0.06, SAFE_Y = 0.04, MIN_BODY_SPAN = 0.35`
  - `export function framingHint(category: string | null, keypoints: Keypoint[]): FramingHint`. The keypoints are already in **preview** coordinates (0..1), after rotation and mirroring.

- [ ] **Step 1: Write the failing tests.**
  - Fixture: the `standing()` pose from `bodyMesh.test.ts`, scaled so it fits inside the safe zone. Shoulders y=0.25, hips 0.55, knees 0.72, ankles 0.9, x between 0.40 and 0.60, all conf 0.9.
  - The cases:
    - `no_person when nothing is confident`: all conf 0.1.
    - `good for a top when shoulders and hips are inside`.
    - `step_back for a dress when knees are below the safe zone`: knees y=0.98.
    - `step_back for pants when hips are above and ankles below`.
    - `move hints use the mirrored preview`:
      - every required joint is shifted to x≥0.97, past the right edge → `move_left`;
      - every required joint is shifted to x≤0.03 → `move_right`.
    - `come_closer when the required span is under 0.35`: a top with shoulders 0.40 and hips 0.62.
    - `missing required joint counts as outside`: left_hip conf 0.1 → `step_back`.
    - `garmentKind maps every category and rejects "constructor"`.
- [ ] **Step 2:** `npx jest src/features/tryon/ar/__tests__/framing.test.ts` → FAIL.
- [ ] **Step 3: Implement** the spec's §2 rules in order, as a single pass over the required joints.
  - Required joints by kind:
    - upper: shoulders and hips;
    - dress: shoulders, hips and knees;
    - bottom: hips, knees and ankles.
  - "All outside joints on one side": every missing or outside joint with a known x has `x < SAFE_X` (→ `move_right`) or `x > 1 − SAFE_X` (→ `move_left`).
- [ ] **Step 4:** Run the same command, plus `bodyMesh.test.ts` → PASS.
- [ ] **Step 5:** Commit: the test file, `bodyMesh.ts`, `framing.ts`.

### Phone gate (controller, not a task)

The new dev build must be installed on the user's phone, either with `adb install -r C:\o\android\app\build\outputs\apk\debug\app-debug.apk` or with `npx expo run:android` from `C:\o` for arm64.

Run `/tryon/spike` and record its diagnostic line in the ledger:
- fps
- model state
- `frame.orientation`
- `isMirrored`
- inference ms
- shoulder and best confidence
- where the dot sits

Then rule on:
- **Rotation:** `enablePhysicalBufferRotation: true`, or rotating the keypoints.
- **Delegate:** `android-gpu` if inference > 25 ms.
- **Pixel format.**

Carry these rulings into Task 4.

### Task 4: Smooth live try-on: tracker, Skia layer and screen; remove the snapshot loop

**Files:**
- Create: `src/features/tryon/ar/useLiveTracker.ts`, `src/features/tryon/ar/LiveGarmentLayer.tsx`
- Modify:
  - `src/app/tryon/live.tsx`
  - `src/features/tryon/ar/liveStatus.ts` and its test
  - `en.ts` and `fil.ts`
  - `src/services/aiApi.ts`: remove `LIVE_POSE_SIDE`, `LivePose` and `estimateLivePose`. Remove `PoseKeypoint` only if nothing else imports it.
- Delete:
  - `src/features/tryon/ar/`: `useLivePose.ts`, `liveLoop.ts`, `pictureSize.ts`, `GarmentOverlay.tsx`, `useGlide.ts`, `ChalkMarks.tsx`, `__tests__/liveLoop.test.ts`, `__tests__/pictureSize.test.ts`
  - `src/app/tryon/spike.tsx`

**Interfaces:**
- Consumes:
  - `parseMoveNet`, `MOVENET_INPUT_SIZE` (moveNet.ts)
  - `createSmoother`, `smoothKeypoints` (smoothing.ts)
  - `bodyMesh`, `Bounds` (bodyMesh.ts)
  - `pointToPreview`, `MIN_KEYPOINT_CONFIDENCE` (overlayGeometry.ts)
  - `alphaBounds` (alphaBounds.ts)
  - `liveStatusKey`, `TrackerState` (liveStatus.ts)
  - `getGarmentCutout` (Task 2)
  - the phone-gate rulings
- Produces:
  - `useLiveTracker({ active, facing }): { frameOutput; keypoints: SharedValue<Keypoint[] | null>; tracker: TrackerState; personSeen: boolean }`.
    - `keypoints` are in **preview** coordinates, after rotation, mirroring and `pointToPreview`.
    - `personSeen` means any keypoint has conf ≥ `MIN_KEYPOINT_CONFIDENCE`.
    - The JS-side values are pushed at most every 250 ms.
  - `<LiveGarmentLayer image={SkImage|null} bounds={Bounds} category={string|null} keypoints={SharedValue<Keypoint[]|null>} />`.
  - `liveStatusKey` gains a `cutout: "loading" | "ready" | "failed"` argument and the keys `tryon.live.cutout_loading` / `tryon.live.cutout_failed`.
    - Priority: unsupported > tracker_failed > loading > cutout_loading > cutout_failed > starting > no_pose.* > null.

- [ ] **Step 1:** Rewrite `liveStatus.test.ts` with the new priority, including both cutout cases. Run it → FAIL. Update `liveStatus.ts` → PASS.
- [ ] **Step 2:** Add the copy to en and fil:
  - `tryon.live.cutout_loading` "Preparing your garment…"
  - `tryon.live.cutout_failed` "We couldn't cut out this item, so it can't be shown live."
- [ ] **Step 3:** Delete the snapshot-loop files, `spike.tsx` and the `aiApi.ts` exports. `npx tsc --noEmit` now errors only in `live.tsx`.
- [ ] **Step 4: Write `useLiveTracker.ts`.**
  - Load the model with `useTensorflowModel(require(model), delegate)`, using the phone-gate delegate ruling. If the GPU fails to load, retry on CPU.
  - Create the resizer with `useResizer({ width: 192, height: 192, channelOrder: "rgb", dataType: "uint8", scaleMode: "cover", pixelLayout: "interleaved" })`.
  - The frame output uses the phone-gate rotation ruling. `onFrame` does, in order: resize → `runSync` → `parseMoveNet` → rotate and mirror into upright preview space → `pointToPreview` → `smoothKeypoints` → `keypoints.value`. Use `try/finally` to dispose of the frame and the resized buffer.
  - 30 consecutive errors, or a model `error` state, set `tracker = "failed"` with a single `console.warn`.
- [ ] **Step 5: Write `LiveGarmentLayer.tsx`.**
  - A Skia `<Canvas>` over the camera. Per frame: `bodyMesh(category, keypoints, bounds)` → `<Vertices>` with an `ImageShader` of the cut-out, at opacity 0.95, with antialiasing on (the soft cut-out alpha gives smooth edges).
  - On `no_pose`, hold the last mesh for 300 ms, then fade it out over 200 ms. Skip the fade when the user has reduce motion on.
  - `bounds` = `alphaBounds` of `image.readPixels`, run once per image on a copy scaled down to ≤128 px.
- [ ] **Step 6: Rewrite `live.tsx`.**
  - Use the VisionCamera `<Camera isActive={focused && appActive} outputs={[frameOutput]} />`. Move `useAppActive` in from `useLivePose.ts`.
  - Load the cut-out with `getGarmentCutout(item)` → Skia `useImage(uri)`. Draw no garment until it is ready.
  - Keep the existing sheet, buttons, back/flip, permission grant and `goBack` logic.
  - Status comes from `liveStatusKey(category, fitKind, tracker, personSeen, cutout)`.
  - Update the file header comment.
- [ ] **Step 7:** `npx tsc --noEmit` clean, `npm test` green, `npm run lint` 0 errors.
- [ ] **Step 8:** Build arm64 from `C:\o` (`./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a`) → BUILD SUCCESSFUL. The phone check is done by the controller with the user.
- [ ] **Step 9:** Commit one commit per deleted file (`refactor(tryon): remove …`), then `liveStatus.test.ts`, `liveStatus.ts`, `en.ts`, `fil.ts`, `aiApi.ts`, `useLiveTracker.ts`, `LiveGarmentLayer.tsx`, `live.tsx`.

### Task 5: Framing guide on the live screen

**Files:**
- Create: `src/features/tryon/ar/FramingGuide.tsx`, `src/features/tryon/ar/useSteadyHint.ts`
- Modify: `src/features/tryon/ar/useLiveTracker.ts` (push the framing hint), `src/app/tryon/live.tsx`, `liveStatus.ts` and its test, `en.ts`, `fil.ts`
- Test: `src/features/tryon/ar/__tests__/steadyHint.test.ts`

**Interfaces:**
- Consumes: `framingHint`, `FramingHint` (Task 3), and Task 4's tracker and status.
- Produces:
  - `useLiveTracker` also returns `hint: FramingHint`, computed in the worklet and pushed with the same 250 ms throttle.
  - `export function nextSteadyHint(state: { shown: FramingHint; candidate: FramingHint; since: number }, hint: FramingHint, nowMs: number): { shown; candidate; since }`. A pure reducer: the candidate replaces `shown` after it has held for 300 ms.
  - `useSteadyHint(hint): { shown: FramingHint; readyToShoot: boolean }`. `readyToShoot` is true once `shown === "good"` has held for 500 ms.
  - `<FramingGuide hint={FramingHint} />`: corner brackets on the safe-zone corners plus one hint line.
- `liveStatusKey` loses `starting` and `no_pose.*`. The framing guide owns those states. Remove their keys from en and fil if nothing else uses them.

- [ ] **Step 1: Write the failing tests** for `nextSteadyHint`:
  - `keeps the shown hint until a new one holds 300 ms`
  - `switches after 300 ms`
  - `resets the timer when the candidate changes`
  - `good is ready to shoot only after 500 ms`
- [ ] **Step 2:** `npx jest src/features/tryon/ar/__tests__/steadyHint.test.ts` → FAIL. Implement → PASS.
- [ ] **Step 3:** Update the `liveStatus` test and source to drop `starting` and `no_pose.*` → PASS.
- [ ] **Step 4:** Add the six `tryon.live.frame.*` strings from spec §2 to en and fil.
- [ ] **Step 5:** Write `FramingGuide.tsx`:
  - brackets are 28 px long and 3 px thick;
  - colour is `ON_CAMERA` while adjusting and `#3DDC84` for `good`, faded with `Animated.timing` over 200 ms;
  - the hint text comes from `t(\`tryon.live.frame.${shown}\`)`.
- [ ] **Step 6:** Mount the guide in `live.tsx` above the garment layer. A status-line key, when present, takes priority over the hint text.
- [ ] **Step 7:** Run `npx tsc --noEmit`, `npm test` and `npm run lint` → clean. Build arm64 → success.
- [ ] **Step 8:** Commit one file per commit.

### Task 6: FASHN provider on the backend

**Files:**
- Modify: `backend/services/tryon_service.py` (add `FashnProvider`, provider selection, `garment_categories` in the inputs)
- Modify: `backend/config.py` (`FASHN_API_KEY`, `FASHN_MODEL`), `backend/.env.example`
- Test: `backend/tests/test_fashn_provider.py` (new). Update `tests/test_tryon_service.py` if provider selection changes its fixtures.

**Interfaces:**
- Consumes: `VTONProvider`, `TryOnError`, `VtonNotConfiguredError`, `TryOnPipeline.run`.
- Produces:
  - `FashnProvider(api_key: str, model: str = "tryon-v1.6", poll_interval: float = 2.0, timeout: float = 90.0)` with `generate(inputs) -> Path`.
  - `make_provider() -> VTONProvider`: returns a `FashnProvider` when `Config.FASHN_API_KEY` is set, otherwise the existing `VTONProvider(Config.TRYON_MODEL_PATH)`.
  - `inputs["garment_categories"]: list[str]`, one per clothing image, holding the raw category or `""`.
  - `FASHN_CATEGORY = {"tops": "tops", "outerwear": "tops", "bottoms": "bottoms", "dresses": "one-pieces"}`. Anything else maps to `"auto"`.

- [ ] **Step 1: Write the failing tests**, with `requests.post` and `requests.get` mocked:
  - `test_run_request_shape`: the URL is `https://api.fashn.ai/v1/run`, the header is `Authorization: Bearer <key>`, and the body is
    `{"model_name": "tryon-v1.6", "inputs": {"model_image": "data:image/…;base64,…", "garment_image": "data:…", "category": "tops", "garment_photo_type": "auto", "mode": "balanced", "output_format": "png", "return_base64": true}}`.
  - `test_polls_until_completed_and_writes_png`: the status goes `in_queue` → `processing` → `completed`. `output[0]` is a PNG data URI, and the PNG bytes are written to the returned path.
  - `test_failed_status_raises_tryon_error_with_message`.
  - `test_timeout_raises_tryon_error`: use a fake clock or `timeout=0`.
  - `test_chains_two_garments_using_previous_output`.
  - `test_http_401_and_429_become_user_safe_errors`.
  - `test_key_never_in_error_or_logs`: use `caplog`, and check `str(exc)`.
  - `test_make_provider_without_key_is_not_configured`.
- [ ] **Step 2:** `cd backend && .venv/Scripts/python -m pytest tests/test_fashn_provider.py -q` → FAIL.
- [ ] **Step 3: Implement** per spec §3.
  - Poll `GET https://api.fashn.ai/v1/status/<id>`.
  - Every request has a timeout of 30 s.
  - `TryOnPipeline.__init__` uses `provider or make_provider()`.
  - `Pipeline.run` fills `garment_categories` from the same rows `_resolve_clothing_refs` reads. Extend that helper to also return the categories, keeping its ownership filter.
- [ ] **Step 4:** Same command → PASS. Then the full `pytest -q` → all pass.
- [ ] **Step 5:** Commit one file per commit.

### Task 7: "Take photo" on the live screen

**Files:**
- Create: `src/features/tryon/ar/usePhotoTryOn.ts`
- Modify: `src/app/tryon/live.tsx`, `en.ts`, `fil.ts`
- Test: `src/features/tryon/ar/__tests__/photoTryOn.test.ts`

**Interfaces:**
- Consumes:
  - `shrinkForUpload`, `uploadBodyPhoto`, `createTryOnJob` (existing)
  - the try-on consent key `ootdify.tryon.consent.v1`, the same one `scan.tsx` uses
  - `readyToShoot` (Task 5)
- Produces:
  - `export async function startPhotoTryOn(deps: { shrink; upload; createJob }, photoUri: string, itemId: string): Promise<{ ok: true; jobId: string } | { ok: false }>`, a pure orchestration so it can be tested.
  - `usePhotoTryOn(itemId)`:
    - returns `{ phase: "idle" | "uploading" | "failed"; take(photoUri: string): Promise<void> }`;
    - `take` is a no-op unless `phase` is `idle` or `failed`;
    - on success it navigates to `/(tabs)/scan`.

- [ ] **Step 1: Write the failing tests:**
  - `shrinks, uploads, then creates one job for the item`
  - `returns ok false when upload throws`, with no job created
  - `ignores a second tap while uploading`: two concurrent `take` calls create exactly one job.
- [ ] **Step 2:** `npx jest src/features/tryon/ar/__tests__/photoTryOn.test.ts` → FAIL. Implement → PASS.
- [ ] **Step 3:** Add the copy from spec §3 to en and fil:
  - `tryon.live.take_photo`
  - `tryon.live.take_photo_hint`
  - `tryon.live.photo_uploading`
  - `tryon.live.photo_failed`
  - `tryon.live.photo_consent`: "To make a realistic photo, this one picture is uploaded and sent to our try-on partner FASHN. Live video never leaves your phone."
- [ ] **Step 4:** In `live.tsx`:
  - add `usePhotoOutput()` to the `<Camera>` outputs;
  - the "Take photo" button is enabled only while `readyToShoot` and `phase === "idle"`;
  - if consent isn't stored, show the consent sheet first, and save the flag on accept;
  - capture with the photo output, then call `take(uri)`;
  - show `photo_uploading` and `photo_failed` in the status line.
- [ ] **Step 5:** Run `npx tsc --noEmit`, `npm test` and `npm run lint` → clean. Build arm64 → success.
- [ ] **Step 6:** Commit one file per commit.

### Task 8: Docs and phone checklist

**Files:**
- Modify: `REMAINING_TASKS.md` §3, `README.md`, `.claude/rules/testing.md:19`, `.claude/rules/backend.md:13-14`, and `backend/.env.example` comments if needed

- [ ] **Step 1:** Rewrite `REMAINING_TASKS.md` §3:
  - link both specs and both plans;
  - record the phone-gate numbers and rulings;
  - add the setup steps: `FASHN_API_KEY` in `backend/.env` and on Railway, and the arm64 build from `C:\o`;
  - add the phone checklist:
    - the cut-out shows with no box;
    - the garment follows on shoulders→hips with no visible lag;
    - the framing hints change correctly as the user moves;
    - "Take photo" gives a FASHN result in Scan history.
  - Remove the old `RATE_LIMIT_LIVE_*` / `LIVE_POSE_IMAGE_SIZE` lines.
- [ ] **Step 2:** In `README.md`, replace any Expo Go instructions with the dev build instructions.
- [ ] **Step 3:** In `.claude/rules`:
  - remove `test_live_pose_route.py` and `live_limits`;
  - mention `cutout` and `FashnProvider` where the neighbouring entries list routes and limits.
- [ ] **Step 4:** Run the full verification (the last Global Constraints line) and report each result.
- [ ] **Step 5:** Commit one file per commit (`docs(tryon): …`, `docs(readme): …`, `docs(rules): …`).
