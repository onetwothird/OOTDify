# Live Try-On Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Try it live" camera screen that places the selected garment image on the user's body using server pose keypoints, about 1–2 updates per second.

**Architecture:** A new stateless backend endpoint `POST /api/tryon/live/pose` runs the existing YOLOv8-pose model at 320 px and returns keypoints normalized to 0..1. It stores nothing and has its own per-minute rate limit. The app runs a sequential snapshot loop (`CameraView.takePictureAsync` → shrink to 480 px → POST), and turns the keypoints into a garment rectangle with pure geometry functions. That rectangle is mapped into preview space and drawn with `expo-image` over the camera preview. The existing async photo try-on stays as it is and still produces the final result.

**Tech Stack:** Flask + Ultralytics (backend), Expo SDK 58 / expo-router / expo-camera / expo-image / expo-image-manipulator / zustand, Jest (ts-jest) and pytest.

**Spec:** `REMAINING_TASKS.md` §3 ("AI live try-on") and `FEATURE_GUIDE.md` §4 ("AR try-on").

## Global Constraints

- Live **2D overlay** only. No ARKit/ARCore, no native modules, no dev build: it must run in Expo Go.
- Endpoint: `POST /api/tryon/live/pose`, decorated `@require_auth` + its own limiter + `@require_consent`. It returns **only normalized keypoints** and **stores nothing** (temp upload deleted in `finally`).
- Rate limit: its own rule, default **240 requests / 60 s** (`RATE_LIMIT_LIVE_MAX=240`, `RATE_LIMIT_LIVE_WINDOW=60`). It must NOT use `upload_limits` (15/hour).
- Pose inference size for this endpoint: **320 px** (`LIVE_POSE_IMAGE_SIZE=320`). `/api/pose` keeps `POSE_IMAGE_SIZE`.
- Snapshot: `takePictureAsync({ quality: 0.3, shutterSound: false })`, then shrink to **480 px** on the longest side before upload.
- Category → anchor mapping: Tops/Outerwear: shoulders → hips. Dresses: shoulders → knees. Bottoms: hips → ankles. Shoes/Bags/Accessories/Other: "not supported yet".
- Front camera: the preview is mirrored but the photo is not, so flip x. Map photo coordinates to the preview with the same "cover" crop the preview uses.
- Honest label on screen, always visible: "Preview only. The garment is placed on your pose points, not rendered realistically." No fake data. Errors go through `ApiError`/`toFriendlyError`.
- All user-visible strings go in **both** `src/shared/i18n/en.ts` and `fil.ts`.
- Theme: no hard-coded white on `primary`. Use `onPrimary*` tokens and 6-digit hex only.
- Expo: CLAUDE.md links the v56 docs, but `package.json` is on SDK 58. Check `CameraView`/`takePictureAsync` options against the docs for the **installed** version (`https://docs.expo.dev/versions/v58.0.0/sdk/camera/`) before Task 5.
- One conventional commit per file (`feat|fix|test|docs(scope): …`), each ending with the Co-Authored-By line.
- Finish with `npx tsc --noEmit`, `npm test`, `cd backend && python -m pytest -q`, all green.

## Review Focus

1. **Rate limit hit mid-session (429):** the loop backs off for `Retry-After` seconds and keeps the last overlay. It must not show an error screen or hammer the server. Test: Task 4, `nextLoopDelay` for 429.
2. **Slow or dropped network:** requests never overlap (the next snapshot only starts after the previous response). After 3 straight failures the overlay fades and a "connection lost, retrying" note shows. Test: Task 4, `nextLoopDelay` failure-streak cases.
3. **Body partly out of frame (e.g. hips not visible, or low-confidence points):** returns `no_pose` with a "step back so your whole torso is visible" hint, never a degenerate or inverted rectangle. Test: Task 2, `garmentFit` missing/low-confidence cases.
4. **Front camera mirroring and aspect-ratio mismatch** (photo 3:4, preview taller): the overlay lands on the body, not beside it. Test: Task 2, `photoToPreview` mirrored and cover-crop cases.
5. **Leaving the screen (back, tab switch, app backgrounded):** the loop stops and no request is sent after unmount. Test: Task 4, the loop controller `stop()` case.

---

### Task 1: Backend live pose endpoint

**Files:**
- Modify: `backend/config.py` (next to `RATE_LIMIT_*` and `POSE_*`)
- Modify: `backend/.env.example` (document the 3 new variables)
- Modify: `backend/services/ratelimit.py` (add `live_limits`)
- Modify: `backend/services/pose_service.py` (`estimate` gains `image_size` override; add `normalize_keypoints`)
- Modify: `backend/routes/pose.py` (add the route)
- Test: `backend/tests/test_live_pose_route.py`

**Interfaces:**
- Produces (HTTP): `POST /api/tryon/live/pose`, multipart `image=<file>` →
  `200 {"success": true, "personDetected": bool, "keypoints": [{"name": str, "x": float 0..1, "y": float 0..1, "confidence": float}], "imageWidth": int, "imageHeight": int, "inference_ms": float}`.
  Errors: `400` (no/invalid image), `429` with `Retry-After`, `500 {"success": false, "error": str}`.
  Keypoints are those of the **largest** detected person (widest shoulder-to-hip bounding box). Fall back to the first if no box can be computed.
- Produces (Python): `pose_service.normalize_keypoints(keypoints: list[dict], width: int, height: int) -> list[dict]`. It divides x by width and y by height, clamps to [0, 1] and rounds to 4 decimals.
- Produces: `PoseService.estimate(image_path, save_annotated=False, output_dir=None, image_size: int | None = None)`, where `None` means `self.image_size`.
- Produces: `ratelimit.live_limits(rule: str)`, which uses `Config.RATE_LIMIT_LIVE_MAX` / `Config.RATE_LIMIT_LIVE_WINDOW`.
- Config: `RATE_LIMIT_LIVE_MAX=240`, `RATE_LIMIT_LIVE_WINDOW=60`, `LIVE_POSE_IMAGE_SIZE=320`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_live_pose_route.py`. Use the fixture from `test_isolate_route.py` (fresh `ratelimit._events`, consent patched, `g.current_user` seeded, `pose.pose_bp` mounted, `Config.UPLOAD_FOLDER = tmp_path`). Monkeypatch `routes.pose.get_pose_service` with a fake whose `estimate(...)` records its kwargs and returns a `PoseResult`.

```python
def test_returns_normalized_keypoints(client, fake_pose):   # 640x480 JPEG; fake kp at (320, 120)
    body = post(client).get_json()
    assert body["success"] is True and body["personDetected"] is True
    kp = body["keypoints"][0]
    assert kp["x"] == 0.5 and kp["y"] == 0.25
    assert body["imageWidth"] == 640 and body["imageHeight"] == 480

def test_runs_pose_at_live_image_size(client, fake_pose):
    post(client)
    assert fake_pose.calls[-1]["image_size"] == 320
    assert fake_pose.calls[-1]["save_annotated"] is False

def test_no_person_is_200_not_error(client, fake_pose_empty):
    body = post(client).get_json()
    assert body["personDetected"] is False and body["keypoints"] == []

def test_missing_image_is_400(client): ...

def test_upload_is_deleted_after_inference(client, fake_pose, tmp_path):
    post(client)
    assert list(tmp_path.iterdir()) == []

def test_picks_largest_person(client, fake_pose_two_people):  # small person first, large second
    assert post(client).get_json()["keypoints"][0]["x"] == <large person's normalized x>

def test_live_limit_is_per_minute_and_separate(client, fake_pose, monkeypatch):
    monkeypatch.setattr(Config, "RATE_LIMIT_LIVE_MAX", 3)
    assert [post(client).status_code for _ in range(4)] == [200, 200, 200, 429]
    # 20 calls must not trip the hourly upload limit (15) when RATE_LIMIT_LIVE_MAX is the default

def test_normalize_keypoints_clamps():
    out = pose_service.normalize_keypoints([{"name": "nose", "x": 700, "y": -5, "confidence": 0.9}], 640, 480)
    assert out[0]["x"] == 1.0 and out[0]["y"] == 0.0
```

`live_limits` must read `Config` **at call time**, inside the wrapper. Otherwise the monkeypatched max has no effect. Do the same for the route's image size.

- [ ] **Step 2: Run tests to verify they fail**
  Run: `cd backend && python -m pytest tests/test_live_pose_route.py -q`
  Expected: FAIL (404 / `AttributeError: normalize_keypoints`).

- [ ] **Step 3: Implement.** Add the config values, `live_limits`, the `image_size` override and `normalize_keypoints`. Then add route `live_pose()` in `routes/pose.py`, with decorators in the order `@require_auth`, `@live_limits("live_pose")`, `@require_consent`. Ingest with `image_service.ingest_upload`, read the size with `PIL.Image.open(path).size`, and call `estimate(..., save_annotated=False, output_dir=None, image_size=Config.LIVE_POSE_IMAGE_SIZE)`. Clean up in `finally`. Log at `debug` level: this endpoint runs about 2×/s, so per-call `info` logs would flood Railway.

- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd backend && python -m pytest -q`
  Expected: all pass (80 existing + new).

- [ ] **Step 5: Commit**, one commit per file, e.g. `feat(backend): add live pose rate limit settings`, `feat(pose): add stateless live pose endpoint`, `test(pose): cover live pose endpoint`, `docs(backend): document live pose env vars`.

---

### Task 2: Overlay geometry (pure)

**Files:**
- Create: `src/features/tryon/ar/overlayGeometry.ts`
- Test: `src/features/tryon/ar/__tests__/overlayGeometry.test.ts`

**Interfaces:**
- Produces:
```ts
export interface Keypoint { name: string; x: number; y: number; confidence: number } // normalized 0..1
export interface Rect { x: number; y: number; width: number; height: number }
export interface Size { width: number; height: number }
export interface Point { x: number; y: number }
export type OverlayFit =
  | { kind: "rect"; rect: Rect; anchors: { top: [Point, Point]; bottom: [Point, Point] } } // normalized photo coords; anchors = the 4 keypoints used (drawn as chalk marks)
  | { kind: "unsupported" }                 // category can't be placed yet
  | { kind: "no_pose" };                    // required points missing / low confidence
export const MIN_KEYPOINT_CONFIDENCE = 0.4;
export function garmentFit(category: string | null, keypoints: Keypoint[]): OverlayFit;
export function photoToPreview(rect: Rect, photo: Size, preview: Size, mirrored: boolean): Rect; // returns preview px
export function pointToPreview(p: Point, photo: Size, preview: Size, mirrored: boolean): Point;   // same cover crop + mirror (x' = 1 − x)
```
- Anchors: left and right point averaged. Tops/Outerwear: shoulders → hips. Dresses: shoulders → knees. Bottoms: hips → ankles. Category matching is case-insensitive, and `null`/unknown → `unsupported`.
- Box (span = bottom anchor y − top anchor y; base width = |left − right| of the top anchor pair, or of the hip pair for Bottoms):
  - width = base width × **1.5** (Bottoms: hip width × **1.8**), centered on the anchor midpoint x.
  - top = top anchor y − span × **0.12**; bottom = bottom anchor y + span × **0.05**.
- `no_pose` if any required point is missing, has confidence < `MIN_KEYPOINT_CONFIDENCE`, or bottom ≤ top.
- `photoToPreview`: cover scale `s = max(preview.w / photo.w, preview.h / photo.h)`. Offset = (preview − photo × s) / 2. If `mirrored`, use `x' = 1 − x − width` before scaling.

- [ ] **Step 1: Write the failing tests**

```ts
const body = (over: Partial<Record<string, [number, number, number?]>> = {}) => /* standing person:
  shoulders (0.4,0.3)/(0.6,0.3), hips (0.42,0.6)/(0.58,0.6), knees y 0.75, ankles y 0.9, conf 0.9 */;

it("places a top from shoulders to hips", () => {
  const fit = garmentFit("Tops", body());
  expect(fit.kind).toBe("rect");
  // width 0.2*1.5=0.3 centered at 0.5; span 0.3 → top 0.3-0.036, bottom 0.6+0.015
  expect(fit).toEqual({ kind: "rect", rect: { x: 0.35, y: 0.264, width: 0.3, height: 0.351 } }); // toBeCloseTo per field
});
it("extends dresses to the knees", ...);              // bottom = 0.75 + 0.45*0.05
it("places bottoms from hips to ankles", ...);        // width 0.16*1.8
it("is case-insensitive", () => expect(garmentFit("outerwear", body()).kind).toBe("rect"));
it.each(["Shoes", "Bags", "Accessories", "Other", null])("%s is unsupported", ...);
it("needs both hips for a top", () => expect(garmentFit("Tops", body({ left_hip: undefined })).kind).toBe("no_pose"));
it("ignores low-confidence points", () => expect(garmentFit("Tops", body({ right_hip: [0.58, 0.6, 0.2] })).kind).toBe("no_pose"));
it("rejects an inverted body (hips above shoulders)", ...);  // → no_pose
it("maps with a cover crop", () => {
  // photo 3:4 (300x400) into preview 300x600 → s=1.5, offsetX=-75, offsetY=0
  expect(photoToPreview({ x: 0.5, y: 0, width: 0.1, height: 0.5 }, {width:300,height:400}, {width:300,height:600}, false))
    .toEqual({ x: 150, y: 0, width: 45, height: 300 });
});
it("mirrors x for the front camera", ...);           // x' = 1-0.5-0.1 = 0.4 → x = 0.4*450-75 = 105
it("returns the anchors it used", () => {            // Tops → shoulders on top, hips on bottom
  const fit = garmentFit("Tops", body());
  expect(fit.kind === "rect" && fit.anchors.top).toEqual([{ x: 0.4, y: 0.3 }, { x: 0.6, y: 0.3 }]);
});
it("maps and mirrors a point", () =>                 // same 300x400 → 300x600 case
  expect(pointToPreview({ x: 0.25, y: 0.5 }, {width:300,height:400}, {width:300,height:600}, true)).toEqual({ x: 262.5, y: 300 }));
```

- [ ] **Step 2: Run to verify failure.** `npx jest src/features/tryon/ar` → FAIL (module not found).
- [ ] **Step 3: Implement** `overlayGeometry.ts` to the interface above.
- [ ] **Step 4: Run to verify pass.** `npx jest src/features/tryon/ar` → PASS.
- [ ] **Step 5: Commit**: `feat(tryon): add live overlay geometry`, `test(tryon): cover live overlay geometry`.

---

### Task 3: API client for live pose

**Files:**
- Modify: `src/shared/lib/shrinkImage.ts` (optional `maxSide` parameter)
- Modify: `src/services/aiApi.ts` (add `estimateLivePose` beside `analyzeImage`)

**Interfaces:**
- Consumes: Task 1 HTTP contract. Task 2 `Keypoint`.
- Produces:
```ts
export const LIVE_POSE_SIDE = 480;                       // in aiApi.ts
export interface LivePose { personDetected: boolean; keypoints: Keypoint[]; imageWidth: number; imageHeight: number; inferenceMs: number | null }
export async function estimateLivePose(photoUri: string, timeoutMs = 8_000): Promise<LivePose>;
export async function shrinkForUpload(uri: string, maxSide = MAX_UPLOAD_SIDE): Promise<string>;   // existing callers unchanged
```
- `estimateLivePose` builds `FormData` with `toNativeFormFile(await shrinkForUpload(uri, LIVE_POSE_SIDE))` and calls `apiRequest("/api/tryon/live/pose", { method: "POST", body }, { timeoutMs })`. It maps `inference_ms` → `inferenceMs`. Errors propagate as `ApiError`. Confirm `ApiError` exposes the HTTP status and `Retry-After` (read `apiClient.ts:28-110`). If `Retry-After` is not exposed, add `retryAfterSeconds?: number` to `ApiError` and set it in `apiRequest` on 429. That is part of this task.

- [ ] **Step 1:** Implement both changes. (Expo-module code with no logic beyond wiring: covered by `tsc` here and by the loop tests in Task 4.)
- [ ] **Step 2:** `npx tsc --noEmit` → no errors. `npm test` → still 44+ passing.
- [ ] **Step 3: Commit** per file: `feat(lib): allow custom max side when shrinking photos`, `feat(api): add live pose client`, (`feat(api): expose retry-after on rate-limit errors` if `apiClient.ts` changed).

---

### Task 4: Snapshot loop controller

**Files:**
- Create: `src/features/tryon/ar/liveLoop.ts` (pure scheduler + controller, no React or Expo imports)
- Create: `src/features/tryon/ar/useLivePose.ts` (React hook wrapping the controller)
- Test: `src/features/tryon/ar/__tests__/liveLoop.test.ts`

**Interfaces:**
- Consumes: `estimateLivePose`, `LivePose` (Task 3), `ApiError` (`src/services/apiClient.ts`).
- Produces:
```ts
export const LOOP_IDLE_MS = 150;          // pause between successful rounds
export const FAILURE_BACKOFF_MS = [1000, 2000, 4000]; // then stays at 4000
export const LOST_AFTER_FAILURES = 3;
export function nextLoopDelay(outcome: { ok: true } | { ok: false; status?: number; retryAfterSeconds?: number }, failureStreak: number): number;
export interface LiveLoopState { pose: LivePose | null; failureStreak: number; lost: boolean; rateLimited: boolean }
export function createLiveLoop(deps: {
  capture: () => Promise<string>;           // returns a photo uri
  estimate: (uri: string) => Promise<LivePose>;
  onState: (s: LiveLoopState) => void;
  sleep?: (ms: number) => Promise<void>;
}): { start(): void; stop(): void };
export function useLivePose(cameraRef: React.RefObject<CameraView | null>, active: boolean): LiveLoopState;
```
- Strictly sequential: capture → estimate → `onState` → sleep(`nextLoopDelay`) → repeat. A failed round keeps the previous `pose`. A success resets `failureStreak` to 0 and `lost`/`rateLimited` to false. On 429 the delay is `retryAfterSeconds * 1000` (default 5000) and `rateLimited` becomes true, and it does **not** count toward `lost`. On 401/403 (`isAuthError`) the loop stops itself.
- `stop()` sets a flag that is checked after every await, so no `capture`/`estimate`/`onState` happens after it.
- `useLivePose` runs the controller while `active && useIsFocused() && AppState === "active"`. `capture` is `cameraRef.current.takePictureAsync({ quality: 0.3, shutterSound: false })` and returns `.uri`.

- [ ] **Step 1: Write the failing tests** (fake `capture`/`estimate`, `sleep` resolving immediately and recording ms):

```ts
it("waits LOOP_IDLE_MS after success", () => expect(nextLoopDelay({ ok: true }, 0)).toBe(150));
it("backs off 1s, 2s, 4s, 4s", () => expect([1,2,3,4].map(n => nextLoopDelay({ ok: false }, n))).toEqual([1000,2000,4000,4000]));
it("honours Retry-After on 429", () => expect(nextLoopDelay({ ok: false, status: 429, retryAfterSeconds: 7 }, 1)).toBe(7000));
it("never overlaps requests", async () => { /* estimate resolves via manual deferred; assert capture called once until it resolves */ });
it("keeps the last pose and flags lost after 3 failures", ...);
it("429 sets rateLimited but not lost", ...);
it("stops on auth error", ...);
it("does nothing after stop()", async () => { /* stop during pending estimate → resolve it → onState not called again, capture not called again */ });
```

- [ ] **Step 2:** `npx jest src/features/tryon/ar/__tests__/liveLoop.test.ts` → FAIL.
- [ ] **Step 3:** Implement `liveLoop.ts`, then `useLivePose.ts`.
- [ ] **Step 4:** `npx jest` → PASS. `npx tsc --noEmit` → clean.
- [ ] **Step 5: Commit** per file: `feat(tryon): add live pose loop controller`, `feat(tryon): add useLivePose hook`, `test(tryon): cover live pose loop`.

---

### Task 5: Live try-on screen, strings and entry point

**Files:**
- Create: `src/features/tryon/ar/liveGarmentStore.ts`
- Create: `src/features/tryon/ar/GarmentOverlay.tsx`
- Create: `src/features/tryon/ar/ChalkMarks.tsx`
- Create: `src/app/tryon/live.tsx`
- Modify: `src/shared/i18n/en.ts`, `src/shared/i18n/fil.ts`
- Modify: `src/app/(tabs)/scan.tsx` (button under the garment grid, near `:812`)

**Interfaces:**
- Consumes: `garmentFit`, `photoToPreview` (Task 2), `useLivePose` (Task 4), `resolveMediaUrl` (`src/shared/lib/storageUrl.ts`).
- Produces:
```ts
// liveGarmentStore.ts — same zustand pattern as selectionStore.ts
interface LiveGarment { imageUrl: string; category: string | null; name: string }
export const useLiveGarment: UseBoundStore<{ garment: LiveGarment | null; set(g: LiveGarment): void; clear(): void }>;
// GarmentOverlay.tsx
export function GarmentOverlay(props: { imageUrl: string; rect: Rect | null; faded: boolean }): JSX.Element;
// ChalkMarks.tsx: preview-px anchors from pointToPreview
export function ChalkMarks(props: { anchors: { top: [Point, Point]; bottom: [Point, Point] } | null; faded: boolean }): JSX.Element;
```

**Design direction** (from the frontend-design pass; the screen is a fitting-room mirror, and its one memorable element is the chalk marks):
- **Layout:** the camera fills the screen edge to edge (no rounded box, unlike Scan). A floating back chevron sits top-left and the flip button top-right, both 44×44 circles: `#000000` at opacity 0.45 with a `#FFFFFF` icon. A bottom sheet in theme `surface` (top radius `borderRadius.lg`, `spacing.md` padding, safe-area bottom inset) holds, left-aligned: a 44 px garment thumbnail with the name (`subheading`, 1 line), the status line (`caption`, `textMuted`), a primary button **"Create full try-on"** (`primary`/`onPrimary`, calls `router.back()` so Scan's existing flow continues), and the disclaimer (`caption`, `textMuted`).
- **Chalk marks (the memorable element):** at each of the 4 anchors, a 14 px horizontal tick and a 6 px vertical tick, crossing, 2 px thick, `#FFFFFF`. A 1 px `#FFFFFF` line at opacity 0.6 joins each pair (the measuring tape). Opacity is 0.9, or 0.35 when `faded`. Hidden when `anchors === null`. The marks sit **above** the garment, so the user sees what it hangs from.
- **Motion:** the first time anchors arrive, the tape lines grow from their midpoint over 300 ms. That is the screen's single entrance moment. After that, ticks and garment glide with `withTiming(400)`. With `useReducedMotion()` true, all of it sets values directly.
- **States** (the status line stays in the sheet and the camera never shows an error card):
  - `no_pose`: garment and marks hidden. Status uses the category's anchors, e.g. "Step back so your shoulders and hips are in view." / "Step back so your hips and ankles are in view."
  - `lost`: garment and marks `faded`. "Connection lost. Retrying…"
  - `rateLimited`: overlay stays as is. "Updating less often for a moment."
  - `unsupported`: no loop runs (`useLivePose(..., false)`). "Live preview works with tops, outerwear, dresses and bottoms."
  - Permission not granted: the sheet shows "Allow camera access to see this on you." with an **"Allow camera"** button, over a `#000000` background.
- **Accessibility:** the status `Text` has `accessibilityLiveRegion="polite"`, and on iOS also `AccessibilityInfo.announceForAccessibility` when it changes. The overlay and marks are `accessible={false}`. Buttons have `accessibilityLabel`s.
- **Don't:** no caps labels, no badge/pill for status, no gradients, no extra accent colour, no tinted near-black (use `#000000`).
- Screen `live.tsx`: if there is no garment in the store, redirect back with `router.back()`. Camera permission flows through `useCameraPermissions` like `scan.tsx`. A front/back toggle (default `front`) drives `mirrored = facing === "front"`. Measure the preview with `onLayout`, and use the photo size from `LivePose.imageWidth/Height`. Status line priority: `unsupported` > `rateLimited` > `lost` > `no_pose` > none.
- Scan entry: show "Try it live" (secondary button style) only when `selectedClothing.size === 1`. On press, look up that item in `catalogItems`/`closetItems`, call `useLiveGarment.getState().set({ imageUrl: resolveMediaUrl(item.image_url), category: item.category, name })`, then `router.push("/tryon/live")`.
- New i18n keys (en copy shown, Filipino in `fil.ts`):
  - `tryon.live.title`: "Try it live"
  - `tryon.live.disclaimer`: "Preview only. The garment is placed on your pose points, not rendered realistically."
  - `tryon.live.unsupported`: "Live preview works with tops, outerwear, dresses and bottoms."
  - `tryon.live.no_pose.upper`: "Step back so your shoulders and hips are in view." (Tops, Outerwear)
  - `tryon.live.no_pose.dress`: "Step back so your shoulders and knees are in view."
  - `tryon.live.no_pose.lower`: "Step back so your hips and ankles are in view."
  - `tryon.live.lost`: "Connection lost. Retrying…"
  - `tryon.live.rate_limited`: "Updating less often for a moment."
  - `tryon.live.full_tryon`: "Create full try-on"
  - `tryon.live.back_a11y`: "Back to try-on"
  - `tryon.live.flip_a11y`: "Switch camera"
  - `tryon.live.permission`: "Allow camera access to see this on you."
  - `tryon.live.grant`: "Allow camera"
  - `scan.tryon.live`: "Try it live"

- [ ] **Step 1:** Read the camera docs for the installed SDK (see Global Constraints) and confirm the `takePictureAsync` option names (`quality`, `shutterSound`) and `facing`.
- [ ] **Step 2:** Implement the store, overlay, screen, strings and scan button.
- [ ] **Step 3:** Run `npx expo start` once so the typed routes include `/tryon/live`, then `npx tsc --noEmit` → clean. Run `npm test` → pass, including `theme.test.ts`.
- [ ] **Step 4:** `npx expo export --platform android` → bundle builds.
- [ ] **Step 5: Commit** per file, e.g. `feat(tryon): add live garment store`, `feat(tryon): add garment overlay component`, `feat(tryon): add chalk mark anchors`, `feat(tryon): add live try-on screen`, `feat(i18n): add live try-on strings`, `feat(i18n): add Filipino live try-on strings`, `feat(scan): add try it live entry point`.
- [ ] **Step 6: Hand-off update.** In `REMAINING_TASKS.md` §3, mark it as built but **not verified on a phone**. Add the phone checklist (front and back camera, top/dress/bottom placement, a shoe showing "not supported", walking out of frame, airplane mode shows "connection lost"). Add the Railway variables `RATE_LIMIT_LIVE_MAX` / `RATE_LIMIT_LIVE_WINDOW` / `LIVE_POSE_IMAGE_SIZE` (optional, defaults apply). Commit: `docs(guide): update live try-on hand-off notes`.
