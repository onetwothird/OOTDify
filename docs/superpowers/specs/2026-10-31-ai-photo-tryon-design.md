# AI photo try-on: cut out, plan, see it on me

Date: 2026-10-31. Status: approved in chat, awaiting spec review.

## Goal

A user photographs a garment, the app removes its background, the user plans
an outfit from their pieces, then picks a photo of themselves (face only or
whole body) and the AI draws them wearing that outfit.

Steps 2 (outfit planner) and the photo-try-on job system already exist. This
spec fills the two missing engines and turns the hidden flow on.

## Decisions (made by Claude, approved by the user)

| Question | Decision | Why |
|---|---|---|
| Image generator | Gemini image model via the existing `GEMINI_API_KEY` | No new account; takes several garment images and a face-only photo; ~$0.04/image |
| Background remover | BiRefNet-lite ONNX on the backend, GrabCut fallback | Free, local (photo never leaves our server), handles busy backgrounds |
| Face-only photos | Allowed; the AI generates the body, and the result says so | User asked for "face or whole body" |
| Cost control | Daily per-user cap, `TRYON_DAILY_LIMIT` (default 10) | ~$0.04/image adds up; server env setting, not an in-app toggle |

## 1. Background removal

- New `backend/services/background_model.py`: loads the ONNX weights at
  `Config.BACKGROUND_MODEL_PATH` (default `models/background/birefnet_lite.onnx`)
  with onnxruntime (already a dependency), lazily and once per process.
  `matte(image) -> alpha mask (H×W float 0..1)`: resize to the model's 1024×1024
  input, normalize with ImageNet mean/std, sigmoid the output, resize back.
- `services/garment_isolation.py`: when the model is loaded, use its mask for
  flat-lay / hung photos instead of GrabCut. The clothes-parser path for
  worn garments is unchanged. When the model file is missing, GrabCut runs as
  today. The existing `ok` / `reason` trust checks still apply to the mask
  (empty or near-full-frame mask → `ok=False`, the app keeps the original).
- Weights are not committed (`.gitignore` the folder). `backend/.env.example`
  documents the variable and the download source; the deploy downloads the
  file at build time.

## 2. Outfit planning

No change.

## 3. The user's photo

- Upload already accepts any photo with a detected person. No migration.
- At generation time the pipeline classifies the photo from the stored pose
  keypoints: hips and knees confidently visible → `whole_body`, otherwise
  `face_only`. Pure function `photo_kind(pose) -> "whole_body" | "face_only"`.
- The re-verify step keeps its "person detected" check, so a photo with no
  one in it still fails honestly.

## 4. Generating the picture

- `VTONProvider` becomes a small interface; new `GeminiTryOnProvider` in
  `backend/services/gemini_tryon.py` implements `is_configured()` (Gemini key
  set) and `generate(inputs) -> Path`.
- `gemini_client.py` gains `generate_image(parts, *, model, timeout_s) -> bytes`
  next to `generate_json`, reusing its client setup, retry-on-overload,
  fallback model and error mapping (`GeminiBlocked`, `GeminiRateLimited`,
  `GeminiFailed`). New config `GEMINI_IMAGE_MODEL`
  (default `gemini-2.5-flash-image`) and `GEMINI_IMAGE_FALLBACK_MODEL` (empty).
- Prompt: the person photo first, then each garment image, with text telling
  the model to dress this person in exactly these garments; keep face,
  identity, skin tone, pose and background; for `face_only`, create a
  natural full-body photo of the same person in a plain setting.
- Provider errors become `TryOnError` with user-safe text:
  blocked → "This photo can't be used for try-on. Try a different one.";
  rate limited / busy → "The AI is busy right now. Try again in a minute.";
  other → `GENERIC_ERROR`. No fallback image is ever produced.
- `TryOnPipeline` picks `GeminiTryOnProvider` when the Gemini key is set,
  otherwise the existing not-configured provider. The result is stored as now
  (private `tryons` bucket, signed URLs). A migration adds a nullable
  `photo_kind text` column to `try_on_jobs`; the pipeline writes it on
  completion so the app can label face-only results.
- Daily cap: `POST /api/tryon` counts the user's jobs created in the last 24h;
  at `TRYON_DAILY_LIMIT` it returns 429 with "You've used today's try-ons.
  Come back tomorrow."
- Consent: generation sends the body photo to Google, so it sits behind the
  existing `require_consent`, and the consent and privacy texts name Google
  for photo try-on (en + fil).

## 4b. Looks good and stays accurate

The user asked for a picture that is visually appealing and accurate to the
real garments. That changes four things:

- **Better model by default.** `GEMINI_IMAGE_MODEL` defaults to
  `gemini-3-pro-image-preview` (sharper, follows garment details and text
  closely; ~$0.13/image at 1K). `GEMINI_IMAGE_FALLBACK_MODEL` defaults to
  `gemini-2.5-flash-image`, used only when the pro model is overloaded.
  Output is a 3:4 portrait.
- **Clean, labelled garment inputs.** Each garment is sent as its cutout on
  white (via `garment_isolation`, falling back to the stored image), each
  preceded by a text label built from its row: category, name, color,
  description (`clothing_items` / `clothing`). Example: "Garment 2 —
  bottom: wide-leg denim jeans, light blue, raw hem." The prompt says to copy
  each garment's exact color, pattern, print, logos, length and fit, and not
  to add or drop any item.
- **Editorial look.** The prompt asks for a photorealistic fashion photo:
  soft natural light, sharp focus, true-to-life skin, flattering but natural
  framing that shows the whole outfit head to toe. Whole-body photos keep the
  user's pose and setting, lit to match. Face-only photos get a full-body
  editorial shot of the same person in a clean, softly lit setting, with face
  and identity preserved.
- **Accuracy check, one retry.** After generating, a Gemini text call
  (`generate_json`, existing model) sees the result plus the garment cutouts
  and answers `{"matches": bool, "issues": [str]}`: is every garment
  present with the right color and pattern, is the face the same person.
  On `matches=false` the image is regenerated once with the issues appended to
  the prompt. The better of the two is kept: the second if it passes,
  otherwise the first. The check never blocks a result on its own; if the
  check call fails, the image is kept. At most 2 images per job, so a job
  costs at most about $0.27.

## 5. App

- `PHOTO_TRYON_AVAILABLE = true`; the existing scan-tab photo flow shows.
- Outfit detail (`src/app/outfit/[id].tsx`) gets a "See it on me" action that
  opens the photo try-on with that outfit's item ids preselected.
- Result screen: shows the image, a note "Body created by AI" for face-only
  results, actions "Save to my looks" and "Share". The waiting state shows
  Penggi (existing thinking pose) and the job status from polling.
- Strings in `en.ts` and `fil.ts`; colors via the theme; no hard-coded text.

## 6. Testing

- Backend (pytest, Gemini faked, no network): `photo_kind` classification;
  `GeminiTryOnProvider` success writes an image, blocked / rate-limited /
  failed map to the right `TryOnError`; pipeline uses the Gemini provider when
  the key is set; daily cap returns 429; `background_model` falls back to
  GrabCut when weights are missing; mask trust checks.
- App (Jest): "See it on me" passes the outfit's ids; result screen shows the
  AI-body note only for face-only jobs.
- Manual: real phone run of capture → cutout → outfit → see it on me, with a
  face-only and a whole-body photo.

## Out of scope

Live AR changes, video try-on, editing the generated image, sharing to Discover.
