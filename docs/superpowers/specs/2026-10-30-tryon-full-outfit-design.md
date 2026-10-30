# Try-On: Full Outfit and Accessories in the Live Preview — Design

**Date:** 2026-10-30
**Extends:** [2026-10-29-tryon-cutout-framing-photo-design.md](2026-10-29-tryon-cutout-framing-photo-design.md)
and [2026-10-29-live-ar-tryon-design.md](2026-10-29-live-ar-tryon-design.md).
Everything there still holds unless this document says otherwise.

## Intent

**Asked, after the live tracker first ran on the phone (Redmi Note 13 Pro 5G):**
- "why it isnt working in hat?"
- "i want all, watch, hat, clothes, pants, and many more"
- "can i go realistic? it's okay if 1 by 1, but it is guaranteed to be 3d?"

**Agreed with the user:**
- Every wardrobe item MoveNet's 17 keypoints can place shows in the live
  preview, not only tops, outerwear, dresses and bottoms.
- **Detection is automatic** (option 1): an accessory's body slot comes from its
  tags, then its name, then its description. No new "worn on" field. (Wardrobe
  items, `ClothingItem`, have no subcategory column, so tags stand in for it.)
- **A whole outfit at once** (option 2), up to 5 items, layered.
- **Picked on Scan** (option 1): multi-select there, then "Live preview". No
  saved-outfit entry point and no in-camera item strip.
- **Approach A** (chosen by Claude at the user's request): clothing keeps the
  existing stretch mesh; accessories use a new rigid placement; every item
  draws on one Skia canvas.
- **"Go realistic" works one item at a time.** With several items on screen the
  user picks which one Decart redraws.
- **Told the user plainly:** neither mode is 3D. The AR preview warps flat
  cut-out photos. Realistic mode is generative video: it can look 3D but has no
  3D model and is not guaranteed (details can change; accessories are
  untested with Decart).

**Out of scope:** rings (MoveNet has no finger points), real 3D, a "worn on"
field, saved outfits as an entry point, changing items without leaving the
camera, more than one realistic item at a time.

## Success criteria

- Selecting a hat, top, pants and a watch on Scan opens the live preview with
  all four following the body, in the right layer order.
- A hat sits on the head and tilts with it; a watch sits on the left wrist and
  turns with the forearm; shoes sit on the ankles.
- An item that can't be placed (a ring, "Accessory 3") is named in the status
  line and the rest of the outfit still shows.
- One item's cut-out failing hides only that item.
- The preview stays smooth on the Redmi with 5 items (checked on the phone; the
  tracker's dev `[LiveTracker] fps=` log is the measure).
- "Go realistic" lets the user pick the item and starts Decart with it.

## 1. Item kinds (`src/features/tryon/ar/itemKind.ts`, new, pure)

`itemKind({ category, tags, name, description }) → ItemKind | null`, where

```ts
type ItemKind =
  | "upper" | "outer" | "dress" | "bottom"          // stretch mesh
  | "hat" | "glasses" | "earrings" | "necklace"     // rigid
  | "watch" | "belt" | "bag" | "shoes";
```

- Category first (case-insensitive): `Tops` → upper, `Outerwear` → outer,
  `Dresses` → dress, `Bottoms` → bottom, `Shoes` → shoes, `Bags` → bag.
- `Accessories` (or an unknown category): match whole words in the
  tags, then the name, then the description, lower-cased. First kind with a match wins, in
  the table order below. No match, or a ring word → null.

| Kind | Words (English, Filipino) |
|---|---|
| hat | hat, cap, beanie, beret, fedora, bucket hat, visor, sumbrero, sombrero |
| glasses | glasses, eyeglasses, sunglasses, shades, spectacles, salamin |
| earrings | earring, earrings, hikaw |
| necklace | necklace, pendant, choker, chain, scarf, bandana, kwintas, kuwintas, alampay |
| watch | watch, smartwatch, bracelet, bangle, wristband, relo, pulseras |
| belt | belt, sinturon |
| ring words (→ null) | ring, rings, singsing |

`garmentKind` / `isSupportedCategory` in `bodyMesh.ts` become thin wrappers
over the mesh kinds (`outer` meshes like `upper`), so existing callers and
tests keep working.

## 2. Rigid accessory placement (`src/features/tryon/ar/accessoryFit.ts`, new, pure worklet)

`accessoryFit(kind, keypoints, bounds) → AccessoryFit` where a fit is one or
two **quads** (4 corners in frame-normalized points, plus texture rects in the
cut-out) or `no_pose`. Each quad is built from an anchor point, a width, the
image's aspect (from the opaque `bounds`) and a rotation angle. Only keypoints
at or above `MIN_KEYPOINT_CONFIDENCE` count; anything missing → `no_pose`.

| Kind | Anchor | Width | Angle | Notes |
|---|---|---|---|---|
| hat | bottom edge centred on the eye midpoint, raised 0.55 × ear distance | 1.7 × ear distance (fallback 2.8 × eye distance) | eye line | |
| glasses | centre on eye midpoint | 2.3 × eye distance | eye line | |
| earrings | top edge at each ear | 0.35 × ear distance | upright | two quads, same texture |
| necklace | top edge at the neck: shoulder midpoint moved 0.25 of the way to the nose | 0.8 × shoulder width | shoulder line | |
| watch | centre at the left wrist | 0.45 × forearm length (elbow→wrist) | perpendicular to the forearm | user's left: `left_wrist` |
| belt | centre on hip midpoint | 1.35 × hip width | hip line | |
| bag | top edge at the right hip | 0.9 × hip width | upright | `right_hip` |
| shoes | top edge at each ankle | 0.5 × hip width each | upright | two quads; see below |

- **Shoes:** if the opaque bounds are wider than 1.3 × their height, the photo
  is a pair: the left half of the image goes on one ankle and the right half on
  the other. Otherwise the whole image goes on both, mirrored on one.
- Constants live at the top of the file like `bodyMesh.ts`, tuned on the phone.
- Front/back camera mirroring follows `LiveGarmentLayer`'s texture flip.

## 3. The outfit

**Store** (`liveGarmentStore.ts`): `garment: LiveGarment | null` becomes
`garments: LiveGarment[]` (each gains `kind: ItemKind | null`). `liveGarmentCandidate` becomes `liveOutfit(selected, items)`:
the selected items with images, at most `MAX_LIVE_ITEMS = 5`, or null when none
can be shown.

**Slots** (`src/features/tryon/ar/outfit.ts`, new, pure):
- One item per slot. Slots: top (upper), outer, lower (bottom), dress, head
  (hat), eyes, ears, neck, wrist, waist (belt), bag, feet.
- A dress takes the top and lower slots; selecting a top or bottom while a
  dress is selected replaces the dress (and the other way round).
- On Scan, selecting an item whose slot is taken replaces the old one;
  selecting a sixth showable item is refused with a short toast.
- `layerOrder` (bottom to top): lower → dress → top → outer → belt → bag →
  necklace → watch → shoes → earrings → glasses → hat.

**Scan** (`src/app/(tabs)/scan.tsx`): `toggleClothing` applies the slot rules
when `PHOTO_TRYON_AVAILABLE` is false (today it keeps one item). The live
button shows when `liveOutfit` is non-null.

**Unplaceable items:** an item with kind null is kept off the canvas and named
in the status line ("Can't show Ring live"). If every item is unplaceable the
existing "unsupported" message lists what works.

## 4. Live screen and drawing

- **Cut-outs:** `getGarmentCutout` runs for every item in parallel, each keyed
  by id + image ref. Per-item state: loading / ready / failed. The screen is
  "ready" once at least one item is ready; failed items are named in the status
  line and skipped.
- **One canvas:** `LiveGarmentLayer` becomes `LiveOutfitLayer`: one `<Canvas>`,
  one `useAnimatedReaction` on `keypoints` that fits every item (mesh or quads)
  in layer order, and one `<Vertices>` per item, each with its own
  `ImageShader`. Hold-then-fade stays, per item. Quads are drawn as 2 triangles
  through the same `<Vertices>` path, so there is one renderer.
- **Tracker:** unchanged, one MoveNet run per frame. It is active while at
  least one item is ready.
- **Framing guide** (`framing.ts`): `framingHint(kinds[], keypoints)` uses the
  union of required joints: head items need eyes and ears, watch needs elbows
  and wrists, shoes need ankles, belt and bag need hips, necklace needs
  shoulders, mesh kinds as today.
- **Status line** (`liveStatus.ts`): fit kind becomes "any item placed" vs
  "none placed"; new keys for cut-out-failed and can't-place items, in `en` and
  `fil`.

## 5. "Go realistic" one item at a time

- With one showable item, unchanged.
- With several, tapping "Go realistic" opens a small picker sheet listing the
  ready items (thumbnail + name). The chosen item's cut-out goes to
  `useRealisticSession`. "Back to live preview" returns to the full AR outfit.
- Consent stays as today (asked once, before the first session).
- The picker says plainly that realistic mode redraws the video with AI and
  may change details. Accessories are offered too; how Decart handles them is
  checked on the phone.

## Lag

- One canvas and one fit pass per tracker frame, however many items.
- Cut-out PNGs are already ≤ 1024 px. Five textures on the GPU at once is
  fine on the target phone; check it.
- Quads are 4 vertices; meshes are unchanged (≤ 78 vertices each).

## Privacy

Unchanged: the AR preview never leaves the phone. Realistic mode sends the
camera video and one cut-out to Decart, after consent.

## Testing

Jest, pure modules (no React Native):
- `itemKind`: each category, each word table row in both languages, word
  boundaries ("scarf" yes, "carfare" no), ring words → null, vague names → null.
- `accessoryFit`: each kind's anchor, width and angle on a synthetic pose;
  missing keypoints → `no_pose`; a tilted head rotates the hat; shoe pair
  splitting vs mirroring.
- `outfit`: slot replacement (including dress vs top/bottom), the 5-item cap,
  `layerOrder`.
- `framing`: union of required joints for mixed outfits.
- `liveOutfit`: selection → outfit, items without images skipped.
- Existing `bodyMesh`, `framing` and `liveStatus` tests keep passing.

On the phone (final checklist):
- hat + top + pants + watch together, front and back camera;
- shoes pair photo vs single-shoe photo;
- smoothness with 5 items (`[LiveTracker] fps=`);
- "Go realistic" picker with a top, then with a hat.

## Verification

`npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors), backend pytest
(unchanged backend), and an Android bundle export, then a dev build on the
phone.
