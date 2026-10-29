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
  - a **"Take photo"** button that produces a realistic AI image.
- The AI provider is **FASHN** (`tryon-v1.6`, about $0.075 per photo). The
  key lives only in `backend/.env`.
- The live overlay shows the garment only, with no background box.
- A framing guide tells the user where to stand.
- The body-outline (silhouette) fit is **not** in scope. The AI photo gives the
  realistic body shape, and a second on-device model would add lag.

## Success criteria

1. The live overlay never shows a garment's photo background:
   - a cut-out with transparency is drawn;
   - if no trustworthy cut-out exists, nothing is drawn and the screen says so.
2. The framing guide always shows one of three things:
   - "no person";
   - a single directional hint (step back, come closer, move left, move right);
   - "looks good".
   The hint covers exactly the joints the garment needs.
3. "Take photo" is enabled only while framing is "good". It produces a
   FASHN try-on of the person in that photo wearing the selected garment,
   shown in the existing try-on history.
4. The live path still sends nothing off the device. Only the photo the user
   explicitly takes is uploaded, and the screen says so before the first upload.
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
- `good` must hold for 500 ms before "Take photo" is enabled.

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

## 3. AI photo (FASHN)

**Backend: provider**
- `services/tryon_service.py` gets a `FashnProvider(VTONProvider)`.
- **Configuration.**
  - `FASHN_API_KEY` and `FASHN_MODEL` (default `tryon-v1.6`) are added to
    `config.py` and `.env.example`.
  - `VTONProvider` selection: if `FASHN_API_KEY` is set, use
    `FashnProvider`; otherwise use the current not-configured provider,
    whose jobs fail honestly with "model not configured".
- **`generate(inputs)`, for each garment in order:**
  1. POST `https://api.fashn.ai/v1/run` with `Authorization: Bearer <key>`
     and `{"model_name": FASHN_MODEL, "inputs": {"model_image": <data URI>, "garment_image": <data URI>, "category": <mapped>, "garment_photo_type": "auto", "mode": "balanced", "output_format": "png", "return_base64": true}}`.
  2. Poll `GET /v1/status/<id>` every 2 s, for up to 90 s.
  3. On `completed`, decode `output[0]` (a data URI) to a temp file.
  4. On `failed`, raise `TryOnError` carrying FASHN's `error.message`.
  5. On timeout, raise `TryOnError("timed out")`.
- **Several garments.** The output of one step becomes the next step's
  `model_image`. That costs one credit per garment, and the job records how
  many credits it used.
- **Category mapping:** tops and outerwear → `tops`; bottoms → `bottoms`;
  dresses → `one-pieces`; anything else → `auto`. `inputs` gains
  `garment_categories: [str]`, filled by `Pipeline.run` from the same rows
  `_resolve_clothing_refs` reads.
- **Network.** `requests` with timeouts. The key is never logged and never
  returned to the app.
- **Errors.** API-level errors (401, 429) become a `TryOnError` with a
  user-safe message: "The try-on service rejected the request", or "busy,
  try again".

**App: "Take photo" on `/tryon/live`**
- A `usePhotoOutput` is added next to the frame output. The button is
  enabled only when framing is steady `good`.
- **First use.** If the try-on consent (`ootdify.tryon.consent.v1`, the
  same flag Scan uses) isn't given, a sheet explains that the photo is
  uploaded to make the try-on, and asks for consent. Nothing uploads
  without it.
- **On capture:**
  1. `shrinkForUpload()`.
  2. `uploadBodyPhoto(uri)`, the existing call that creates a
     `body_photos` row.
  3. `createTryOnJob({ bodyPhotoId, clothingIds: [item.id] })`.
  4. Navigate to the Scan tab (`/(tabs)/scan`). Its try-on history already
     lists jobs, polls active ones every 5 s, shows the result image when
     the job completes, and shows failures honestly.
- **Copy:**
  - `tryon.live.take_photo` "Take photo"
  - `tryon.live.take_photo_hint` "Get a realistic photo of you in this"
  - `tryon.live.photo_uploading` "Uploading your photo…"
  - `tryon.live.photo_failed` "Couldn't start the try-on. Try again."

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

- The live path is unchanged: no frame or keypoint data leaves the device.
- Cut-outs: the backend reads the item image from storage by id. The app
  uploads nothing for this.
- AI photo:
  - one user-initiated photo is uploaded to the backend;
  - the backend sends it to FASHN with `return_base64: true`, so the result
    comes back through the backend and is stored in the private `tryons`
    bucket like every try-on today;
  - FASHN's own retention applies to the request, and the consent sheet
    names FASHN.

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
- `FashnProvider`, with `requests` mocked:
  - the request body shape and auth header;
  - polling until `completed`;
  - `failed` raises a `TryOnError` with FASHN's message;
  - timeout;
  - chaining two garments;
  - the key never appears in logs or errors.
- Provider selection: with no key, the current not-configured provider is
  used.

**Phone**
- The cut-out shows with no box.
- The guide hints change correctly as you move.
- "Take photo" produces a FASHN result in the history.

## Verification

`npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors),
`cd backend && .venv/Scripts/python -m pytest -q`, and a phone run of the new
dev build.
