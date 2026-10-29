# Try-On: Garment Cut-Outs, Framing Guide and AI Photo — Design

**Date:** 2026-10-29
**Extends:** [2026-10-29-live-ar-tryon-design.md](2026-10-29-live-ar-tryon-design.md)
(the on-device live AR). Everything there still holds unless this document
says otherwise.

## Intent

**Asked, after the first phone test:**
- "the images has background, i want it to remove background and clothes/garments only"
- "i want the frame to have an indicator … so that user will know how far they can go"
- "it is too laggy"
- "make it exactly in my body shape" and "work just like" wanna.fashion

**What we found:**
- The phone was running an old build (`RNSkiaModule could not be found`). The
  white lines and lag came from the old server-snapshot screen, not from the
  new on-device tracker.
- wanna.fashion's live try-on renders professionally made 3D garment models
  (CLO/Browzwear). OOTDify only has photos of users' own clothes, so it can't
  do that. Its realistic results come from a generative photo try-on.

**Agreed with the user:**
- Do **both**:
  - the live AR, to see the garment follow you;
  - a realistic AI mode.
- The AI provider was **FASHN** photos at first. On 2026-10-29 it was
  replaced by **Decart Lucy VTON** realistic *live* mode (§3), after the user
  pointed at anywear.decart.ai. The key lives only in `backend/.env`.
- The live overlay shows the garment only, with no background box.
- A framing guide tells the user where to stand.
- The body-outline (silhouette) fit is **not** in scope. The AI photo gives the
  realistic body shape, and a second on-device model would add lag.

**Build order (user, 2026-10-29):** "fix the background first before the
fashn … smoothen them all". The order is:
1. Garment cut-out (§1).
2. The smooth live try-on: the existing plan's Task 7, the lag work (§Lag),
   soft cut-out edges, and steady garment motion.
3. Framing guide (§2).
4. Realistic live mode with Decart (§3), last. This was FASHN before 2026-10-29.

## Success criteria

1. The live overlay never shows a garment's photo background:
   - a cut-out with transparency is drawn;
   - if no trustworthy cut-out exists, nothing is drawn and the screen says so.
2. The framing guide always shows one of three things:
   - "no person";
   - a single directional hint (step back, come closer, move left, move right);
   - "looks good".
   The hint covers exactly the joints the garment needs.
3. "Go realistic" is enabled only while framing is "good" and the cut-out is
   ready.
   - It starts a Decart live session of at most `REALISTIC_SESSION_SECONDS`
     (60), showing the person wearing the garment.
   - When the session ends, the screen always returns to the free AR preview.
4. The default AR path still sends nothing off the device. Video is streamed
   only during a realistic session, which the user starts after a consent
   sheet that names Decart and its training use.
5. The lag is measured on the real dev build, and the fix is decided from
   the numbers (see §Lag).

## 1. Garment cut-out

**Backend**
- `services/garment_isolation.py`: `_compose` gains `transparent: bool`.
  - When true, it outputs an RGBA **PNG**, using the existing blurred mask as
    alpha, cropped and padded as today.
  - The white JPEG path stays the default, so the capture flow is unchanged.
- `IsolationResult` gains a `png` field for the transparent output.
- New route `GET /api/clothing/<item_id>/cutout`:
  - `require_auth`, `require_consent`, and a new `upload_limits("cutout")`
    entry.
  - **Ownership.** The item must be either the caller's
    `clothing_items` row (`user_id` = token user) or a shared `clothing`
    catalog row. Otherwise 404. Ownership is resolved the same way as
    `tryon_service._resolve_clothing_refs`.
  - **Processing.** It downloads the item image server-side, runs
    `isolate_garment(..., transparent=True)` and returns
    `{ ok, reason, png_base64, width, height }`.
  - **Failure.** When `ok` is false, it returns no image, plus the existing
    `IsolationReason`.
  - **Storage.** Nothing is stored server-side.

**App**
- `src/features/tryon/cutout.ts` → `getGarmentCutout(item): Promise<CutoutOutcome>`.
  - Calls the route and writes the PNG to `Paths.cache` as
    `cutout-<itemId>-<hash(image_url)>.png`.
  - Later calls reuse the cached file. A new `image_url` means a new hash,
    so the cut-out is redone.
  - `CutoutOutcome = { status: "ready"; uri; width; height } | { status: "failed"; reason } | { status: "error" }`.
- The live screen loads the cut-out PNG into a Skia image and computes
  `alphaBounds` from its pixels.
  - `bodyMesh`'s `garment` bounds come from that.
  - While the cut-out loads, the status line shows
    `tryon.live.cutout_loading`.
  - On `failed` or `error`, it shows `tryon.live.cutout_failed` and draws
    no garment.

## 2. Framing guide

**Pure unit** `src/features/tryon/ar/framing.ts`. It imports nothing native and
its functions start with `'worklet'`. Tests live in `ar/__tests__/framing.test.ts`.

```ts
export type FramingHint = "no_person" | "step_back" | "come_closer" | "move_left" | "move_right" | "good";
export function framingHint(category: string | null, keypoints: Keypoint[]): FramingHint;
```

**Required joints per garment kind:**

| Kind | Categories | Required joints |
|---|---|---|
| upper | tops, outerwear | shoulders and hips |
| dress | dresses | shoulders, hips and knees |
| bottom | bottoms | hips, knees and ankles |

The kind comes from bodyMesh's category table, which is exported and not
duplicated.

**Safe zone:** the preview inset by `SAFE_X = 0.06` at the left and right, and
by `SAFE_Y = 0.04` at the top and bottom.

**Rules, in order** (all coordinates normalized, confidence ≥ 0.3):
1. **No person.** No keypoint at all is confident → `no_person`.
2. **Missing joints.** Some required joints are missing or outside the safe
   zone:
   - if the required span runs off **both** the top and the bottom, or off
     the bottom only for upper and dress kinds → `step_back`;
   - if the missing or outside joints are all on one side →
     `move_left` / `move_right`;
   - anything else → `step_back`.
   - Left and right are in the **user's** terms on the mirrored front
     preview. The joint's x is in preview coordinates after mirroring, and
     the hint names the direction that brings it back in.
3. **Too small.** The body is smaller than `MIN_BODY_SPAN = 0.35` of the
   preview height → `come_closer`. The span is measured from the topmost to
   the bottommost required joint.
4. Otherwise → `good`.

**Steadiness** lives in the screen, not the pure unit:
- A hint must hold for 300 ms before it replaces the shown hint.
- `good` must hold for 500 ms before "Go realistic" is enabled.

**Component** `src/features/tryon/ar/FramingGuide.tsx`:
- Four corner brackets drawn on the safe-zone corners.
- Colours, which are camera chrome:
  - white (`ON_CAMERA`) while adjusting;
  - a fixed camera green `#3DDC84` for `good`.
- One hint line underneath.
- It uses React Native `Animated` for the colour fade, following the repo
  rule.

**Copy, in `en.ts` and `fil.ts`:**
- `tryon.live.frame.no_person` "Stand in the frame"
- `tryon.live.frame.step_back` "Step back"
- `tryon.live.frame.come_closer` "Come closer"
- `tryon.live.frame.move_left` "Move left"
- `tryon.live.frame.move_right` "Move right"
- `tryon.live.frame.good` "Looks good, hold still"

**Status line.** It takes priority over the framing hint for
`unsupported`, `tracker_failed`, `loading`, `cutout_loading` and
`cutout_failed`. In every other state the framing hint replaces the old
`starting` and `no_pose.*` messages. Those keys stay in `liveStatus.ts`
only as long as something still uses them; Task 7 removes the unused ones.

## 3. Realistic live mode (Decart Lucy VTON)

**Changed 2026-10-29:** this replaces the FASHN photo try-on. The user pointed at
https://anywear.decart.ai/ and chose "Decart replaces FASHN".

**What it is:** Decart's Lucy VTON is a real-time video model. It redraws the
live camera stream with the garment on the person. It runs over WebRTC
(LiveKit) and starts about 1.5 s after connecting.

- Model: `lucy-vton-3.6`.
- Price: $0.02 per second of active generation at 720p.

The free on-device AR stays the default view. Realistic mode is an opt-in,
time-limited session.

**Backend: client tokens** (`backend/routes/realistic.py`)

- Route: `POST /api/tryon/realistic/token`.
  - Decorators: `require_auth`, `require_consent`, `upload_limits("realistic_token")`.
  - The upload cap (15 per hour per user) is the cost cap: at most 15 sessions
    per user per hour.
- It calls Decart at `POST https://api.decart.ai/v1/client/tokens`.
  - Header: `x-api-key: <DECART_API_KEY>`.
  - Body: `{"expiresIn": 60, "allowedModels": [DECART_MODEL]}`.
- On success it returns `{success: true, token: {apiKey, expiresAt}, model, session_seconds}`.
- Settings, added to `config.py` and `.env.example`:
  - `DECART_API_KEY`: empty by default.
  - `DECART_MODEL`: default `lucy-vton-3.6`.
  - `REALISTIC_SESSION_SECONDS`: default `60`.
- Errors:
  - No key configured → `503 {success: false, error: "not_configured"}`.
  - Decart 401, 429 or 5xx, or a 10 s timeout → `502 {success: false, error: "provider_error"}`.
- The key and Decart's response text are never logged or returned.

**App: dependencies**

- Install with `npx expo install`:
  - `@decartai/sdk`;
  - LiveKit's React Native packages as Decart's docs name them:
    `@livekit/react-native`, `@livekit/react-native-webrtc` and the LiveKit
    Expo config plugin.
- Plain `react-native-webrtc` is not supported by Decart.
- These are native modules, so a new dev build is needed.

**App: session** (`src/features/tryon/realistic/`)

- `requestRealisticToken(): Promise<{ apiKey; expiresAt; model; sessionSeconds }>`
  in `aiApi.ts`.
- `useRealisticSession(itemCutoutUri)` returns
  `{ phase, remoteStream, secondsLeft, start(), stop() }`.
  - `phase` is one of
    `"idle" | "consent" | "connecting" | "live" | "ended" | "failed" | "not_configured"`.
- `start()` runs these steps in order:
  1. If the realistic consent flag (`ootdify.tryon.realistic.consent.v1`) is
     not stored, set `phase` to `consent` and show the sheet.
  2. Release the camera: the VisionCamera `<Camera>` goes inactive so LiveKit
     can open it.
  3. Call `client.realtime.connect(localStream, { model, onRemoteStream, initialState: { image: <cut-out PNG> } })`.
     `apiKeyProvider` fetches a fresh token from the backend for every dial.
  4. Count down from `sessionSeconds`.
- The session ends at 0, on `stop()`, or when the app goes to the background.
  It then disconnects and sets `phase` to `ended`.
- "Back to live preview" re-activates the VisionCamera and resumes the
  on-device AR.
- Connection or stream errors set `phase` to `failed` and show an honest
  message. There is no silent fallback.

**App: screen**

- On `/tryon/live`, a **"Go realistic"** button is enabled only while framing
  is steady `good` and the cut-out is ready.
- While the session is `live`:
  - the remote stream fills the camera area, drawn with LiveKit's video view
    and mirrored for the front camera;
  - a countdown pill and a **"Stop"** button sit over it;
  - the framing guide and the garment layer are hidden.

**Copy**

- `tryon.live.go_realistic` "Go realistic"
- `tryon.live.realistic_hint` "See a realistic live preview (up to 1 minute)"
- `tryon.live.realistic_consent` "Realistic mode streams your camera video to our partner Decart, which redraws you wearing this item. Decart may use the video to improve its AI. It runs for up to 1 minute. The normal preview never leaves your phone."
- `tryon.live.realistic_connecting` "Starting realistic mode…"
- `tryon.live.realistic_seconds` "{{seconds}}s left"
- `tryon.live.realistic_stop` "Stop"
- `tryon.live.realistic_ended` "Realistic preview ended"
- `tryon.live.realistic_back` "Back to live preview"
- `tryon.live.realistic_failed` "Realistic mode couldn't start. Check your connection and try again."
- `tryon.live.realistic_not_configured` "Realistic mode isn't set up yet."

**Unknown until tried on the phone:** whether `@decartai/sdk`'s realtime
client runs under React Native with LiveKit's RN packages. Decart's docs say it
is supported. The plan starts this work with a minimal connect check on the
phone. If it can't connect, we stop and decide with the user.

## Lag

The user's lag report came from the old build. After the new build is installed:
1. Run `/tryon/spike` (it now shows fps, model state, frame orientation,
   mirroring, inference ms and confidence) and record the numbers in
   `REMAINING_TASKS.md` §3.
2. **Rotation.** If `frame.orientation` isn't `up`, enable
   `enablePhysicalBufferRotation` in the live frame output, or rotate the
   keypoints, whichever the measured cost favours. Record the decision.
3. **GPU.** If inference is above 25 ms, load the model with the
   `android-gpu` delegate. `enableAndroidGpuLibraries` is already set.
   Fall back to CPU if the GPU fails to load.
4. **Smoothing.** Re-tune `MIN_CUTOFF` only if the garment visibly trails a
   still-then-moving body after steps 2 and 3.

## Privacy

- The default live AR is unchanged: no frame or keypoint data leaves the
  device.
- Cut-outs: the backend reads the item image from storage by id. The app
  uploads nothing for this.
- Realistic mode:
  - Camera video goes to Decart only during a session the user starts.
  - Before the first session, a consent sheet says this and names Decart's
    training use.
  - Each session is capped at 60 s, and server-side at 15 sessions per user
    per hour.
  - The Decart API key never reaches the app. The app only gets 60-second
    client tokens.

## Testing

**Jest**
- `framing.test.ts` covers:
  - each rule;
  - each garment kind;
  - left and right on the mirrored preview;
  - the `no_person` and `come_closer` boundaries.
- `cutout.test.ts` covers the cache key, cache reuse, and the `failed` and
  `error` paths, with mocked `apiRequest` and file system.

**pytest**
- `_compose(transparent=True)` returns an RGBA PNG whose alpha is 0 at the
  corners.
- The cutout route:
  - returns 404 for another user's item;
  - returns 200 with PNG data for the caller's own item;
  - returns `ok: false` with no image when isolation fails.
- Realistic token route, with `requests` mocked:
  - the request URL, the `x-api-key` header and the body;
  - 200 returns the token;
  - no key gives 503 `not_configured`;
  - a Decart 401, a 429 and a timeout each give 502 `provider_error`;
  - the key never appears in the response or the logs;
  - `require_auth` is enforced.

**Phone**
- The cut-out shows with no box.
- The guide hints change correctly as you move.
- "Go realistic" redraws the garment on the person live, counts down from
  60, and returns to the AR preview.

## Verification

`npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors),
`cd backend && .venv/Scripts/python -m pytest -q`, and a phone run of the new
dev build.
