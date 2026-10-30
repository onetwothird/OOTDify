# Full-Outfit Live Try-On Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The live try-on shows a whole outfit of up to 5 closet items: clothing, hats, glasses, earrings, necklaces/scarves, watches, belts, bags and shoes. Each one follows the body, and "Go realistic" redraws one chosen item.

**Architecture:**
- **Clothing** keeps the stretch mesh in `bodyMesh.ts`.
- **Accessories** get a rigid quad placement in the new `accessoryFit.ts`. Both feed one `<Vertices>` path per item on a single Skia canvas.
- **Item kinds** come from the category, then from keywords in tags, name and description. A slot table decides conflicts and layer order.
- **The MoveNet tracker** is unchanged: one run per frame serves every item.

**Tech Stack:** Expo SDK 58, React Native (Fabric), VisionCamera 5 + fast-tflite MoveNet, Reanimated/worklets, @shopify/react-native-skia 2.14, zustand, Jest (pure modules only; no React Native in tests).

**Spec:** `docs/superpowers/specs/2026-10-30-tryon-full-outfit-design.md`

## Global Constraints

- **Up to 5 items:** `MAX_LIVE_ITEMS = 5`.
- **Pure modules stay free of React Native:**
  - Jest cannot import `react-native`.
  - Anything called from the frame or UI worklets starts with `"worklet";`, like `bodyMesh.ts`.
- **i18n:** every new user-facing string goes in both `src/shared/i18n/en.ts` and `src/shared/i18n/fil.ts`.
- **Fixed on-camera colours:** camera chrome uses `CAMERA_BG` / `ON_CAMERA`; themed sheets use `makeStyles` and theme tokens.
- **No fake data, honest failures:** an item that can't be shown is named on screen and never silently dropped.
- **Commits:** one conventional commit per file (`feat(tryon): …`, `test(tryon): …`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Before each commit:** `npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors).
- **Native builds** come from `C:\o` (sync `src/`, `app.json`, `plugins/` first). Set `ANDROID_HOME=$LOCALAPPDATA/Android/Sdk` and build arm64-v8a only.

## Review Focus

1. **Head-only outfits:**
   - **Condition:** an outfit of just a hat, glasses or earrings.
   - **Expected:** framing never says "Come closer" forever, because the eyes and ears span far less than `MIN_BODY_SPAN`. Skip the span check when the required joints are only eyes and ears.
   - **Test:** Task 5.
2. **Outfits that mix dresses with separate tops and bottoms:**
   - **Condition:** a dress is selected and the user then picks a top (or the reverse).
   - **Expected:** the dress is replaced, and two lower garments never stack.
   - **Test:** Task 3.
3. **Words inside other words:**
   - **Condition:** names like "Earring" or "Carfare tee".
   - **Expected:** "Earring" is earrings, not a ring (null). "Carfare tee" is not a scarf. Only whole-word matches count.
   - **Test:** Task 1.
4. **One cut-out fails while the others load:**
   - **Expected:** the screen shows the rest, names the failed item, and keeps the tracker running.
   - **Test:** Task 6 `liveStatusKey` cases.
5. **Back camera with two-quad items (shoes, earrings):**
   - **Expected:** the mirrored shoe still lands on the opposite ankle, and the textures flip the same way as clothing.
   - **Test:** Task 2 shoe cases.

---

### Task 1: Item kinds

**Files:**
- Create: `src/features/tryon/ar/itemKind.ts`
- Modify: `src/features/tryon/ar/bodyMesh.ts:33-60` (`KINDS`, `garmentKind`, `isSupportedCategory`)
- Test: `src/features/tryon/ar/__tests__/itemKind.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MeshKind = "upper" | "outer" | "dress" | "bottom";
  export type AccessoryKind = "hat" | "glasses" | "earrings" | "necklace" | "watch" | "belt" | "bag" | "shoes";
  export type ItemKind = MeshKind | AccessoryKind;
  export interface KindSource { category: string | null; tags?: string[] | null; name?: string | null; description?: string | null }
  export function itemKind(src: KindSource): ItemKind | null;
  export function isMeshKind(kind: ItemKind): kind is MeshKind; // "worklet"
  ```
- `bodyMesh.ts` keeps `garmentKind(category)` and `isSupportedCategory(category)` with the same signatures. `GarmentKind` stays `"upper" | "dress" | "bottom"`. Add `export function meshGarmentKind(kind: MeshKind): GarmentKind` (outer → upper) and `export function meshFit(kind: MeshKind, keypoints: Keypoint[], garment: Bounds): MeshFit`. `bodyMesh(category, …)` becomes a wrapper over `meshFit`.

- [ ] **Step 1: Write the failing test** `itemKind.test.ts`:
  - `"maps clothing categories"`: Tops→upper, Outerwear→outer, Dresses→dress, Bottoms→bottom, Shoes→shoes, Bags→bag, case-insensitive (`"tops"`).
  - `"reads accessories from tags, then name, then description"`:
    - `{category:"Accessories", tags:["cap"], name:"Blue thing"}` → hat;
    - `{category:"Accessories", tags:[], name:"Aviator sunglasses"}` → glasses;
    - `{category:"Accessories", name:"Gift", description:"leather watch"}` → watch;
    - tags win over name: `{tags:["belt"], name:"watch"}` → belt.
  - `"knows the Filipino words"`: sumbrero→hat, salamin→glasses, hikaw→earrings, kwintas→necklace, relo→watch, pulseras→watch, sinturon→belt.
  - `"matches whole words only"`: "Earring set"→earrings; "Gold ring"→null; "singsing"→null; "Carfare tee" (Accessories)→null; "Bucket hat"→hat; "Silk scarf"→necklace.
  - `"is null for vague names and no category"`: `{category:"Accessories", name:"Accessory 3"}`→null; `{category:null, name:null}`→null.

- [ ] **Step 2: Run it to verify it fails**
  - Run: `npx jest src/features/tryon/ar/__tests__/itemKind.test.ts`
  - Expected: FAIL, "Cannot find module '../itemKind'".

- [ ] **Step 3: Implement `itemKind`.**
  - Use the spec §1 word table in table order. The ring words return null.
  - Tokenize lower-cased text on `/[^a-z]+/`. Match multi-word entries ("bucket hat") as adjacent tokens.
  - An unknown category falls through to the keyword match, same as Accessories.
  - `isMeshKind` has `"worklet";`.
  - Rewire `bodyMesh.ts` so `garmentKind` uses `itemKind({category})` restricted to mesh kinds, mapped through `meshGarmentKind`. Keep the `"worklet"` directives on `garmentKind`, `meshFit` and `bodyMesh`. `itemKind` itself runs on JS only, so call `garmentKind` from worklets only with a precomputed kind. Make `meshFit` the worklet path.

- [ ] **Step 4: Run all tests to verify they pass**
  - Run: `npx jest src/features/tryon/ar`
  - Expected: PASS, including the existing `bodyMesh.test.ts`.

- [ ] **Step 5: Commit**: one commit per file: `feat(tryon): detect item kinds from category and keywords`, `refactor(tryon): expose meshFit by kind`, `test(tryon): cover item kind detection`.

### Task 2: Rigid accessory placement

**Files:**
- Create: `src/features/tryon/ar/accessoryFit.ts`
- Test: `src/features/tryon/ar/__tests__/accessoryFit.test.ts`

**Interfaces:**
- Consumes: `AccessoryKind` (Task 1); `Keypoint`, `Point`, `MIN_KEYPOINT_CONFIDENCE` (`overlayGeometry.ts`); `Bounds` (`bodyMesh.ts`).
- Produces:
  ```ts
  /** Corners in frame-normalized points: top-left, top-right, bottom-right, bottom-left (image orientation). */
  export interface Quad { corners: [Point, Point, Point, Point]; tex: Bounds; mirror: boolean }
  export type AccessoryFit = { kind: "quads"; quads: Quad[] } | { kind: "no_pose" };
  export function accessoryFit(kind: AccessoryKind, keypoints: Keypoint[], garment: Bounds): AccessoryFit; // "worklet"
  /** Two triangles per quad, texCoords normalized 0..1 of the image (mirror flips x inside tex). */
  export function quadsToMesh(quads: Quad[]): { vertices: Point[]; texCoords: Point[]; indices: number[] }; // "worklet"
  ```

- [ ] **Step 1: Write the failing test** `accessoryFit.test.ts`.
  - **Synthetic pose:**
    - eyes (0.47,0.20)/(0.53,0.20); ears (0.44,0.21)/(0.56,0.21); nose (0.5,0.23);
    - shoulders (0.40,0.32)/(0.60,0.32); elbows (0.38,0.45)/(0.62,0.45); wrists (0.37,0.56)/(0.63,0.56);
    - hips (0.43,0.60)/(0.57,0.60); ankles (0.44,0.95)/(0.56,0.95);
    - all confidence 0.9; `garment = {x:0,y:0,width:1,height:1}`.
  - **One case per spec §2 row.** Assert `toBeCloseTo(…, 3)`:
    - **hat:** width = 1.7 × 0.12 = 0.204; bottom-edge centre at y = 0.20 − 0.55 × 0.12 = 0.134; x = 0.5. With the ears missing it falls back to 2.8 × 0.06 = 0.168.
    - **glasses:** centre (0.5, 0.20), width 0.138.
    - **earrings:** 2 quads, each top edge centred on its ear, width 0.042.
    - **necklace:** top-edge centre at (0.5, 0.32 + 0.25 × (0.23 − 0.32)) = (0.5, 0.2975), width 0.16.
    - **watch:** centre (0.37, 0.56), width 0.45 × forearm length.
    - **belt:** centre (0.5, 0.60), width 0.189.
    - **bag:** top-edge centre at the right hip (0.57, 0.60), width 0.126.
    - **shoes:** 2 quads at the ankles, each width 0.07.
  - **Each quad's height is width × (bounds.height / bounds.width)**, so placement keeps the image aspect.
  - `"hat tilts with the eye line"`: with right_eye.y = 0.23, the hat's top edge has the same slope as the eye line.
  - `"watch turns with the forearm"`: the top edge runs perpendicular to the elbow→wrist vector.
  - `"missing keypoints give no_pose"`: no eyes → hat is no_pose; low-confidence (0.1) left wrist → watch is no_pose.
  - `"shoe pair photo is split; single shoe is mirrored"`:
    - pair: bounds `{0,0,1,0.5}` (wider than 1.3 × height) gives quads with tex x-ranges [0,0.5] and [0.5,1], both `mirror:false`;
    - single: bounds `{0,0,0.5,1}` gives both quads with the full tex, and exactly one `mirror:true`.
  - `"quadsToMesh"`: 1 quad → 4 vertices, indices `[0,1,2, 0,2,3]`. Mirror swaps the tex x of left and right corners.
  - `"never emits NaN"`: coincident eyes → no_pose.

- [ ] **Step 2: Run it to verify it fails**
  - Run: `npx jest src/features/tryon/ar/__tests__/accessoryFit.test.ts`
  - Expected: FAIL, module missing.

- [ ] **Step 3: Implement.**
  - Constants go at the top of the file, named after the spec values (`HAT_WIDTH_PER_EAR = 1.7`, `HAT_RAISE_PER_EAR = 0.55`, `HAT_WIDTH_PER_EYE = 2.8`, `GLASSES_WIDTH_PER_EYE = 2.3`, `EARRING_WIDTH_PER_EAR = 0.35`, `NECK_TOWARD_NOSE = 0.25`, `NECKLACE_WIDTH_PER_SHOULDER = 0.8`, `WATCH_WIDTH_PER_FOREARM = 0.45`, `BELT_WIDTH_PER_HIP = 1.35`, `BAG_WIDTH_PER_HIP = 0.9`, `SHOE_WIDTH_PER_HIP = 0.5`, `SHOE_PAIR_ASPECT = 1.3`, `MIN_PAIR_WIDTH = 0.02`).
  - "Upright" quads (earrings, bag, shoes) take the angle of the shoulder line, or the hip line for bag and shoes, so they lean with the body.
  - A quad is built from (anchor point, which edge it anchors: top/centre/bottom, width, angle, tex, mirror). Every function has `"worklet";`.

- [ ] **Step 4: Run tests to verify they pass.**
  - Run: `npx jest src/features/tryon/ar`
  - Expected: PASS.

- [ ] **Step 5: Commit**: `feat(tryon): place accessories as rigid quads on the pose`, `test(tryon): cover accessory placement`.

### Task 3: Outfit slots and layer order

**Files:**
- Create: `src/features/tryon/ar/outfit.ts`
- Test: `src/features/tryon/ar/__tests__/outfit.test.ts`

**Interfaces:**
- Consumes: `ItemKind` (Task 1).
- Produces:
  ```ts
  export const MAX_LIVE_ITEMS = 5;
  export type Slot = "top" | "outer" | "lower" | "head" | "eyes" | "ears" | "neck" | "wrist" | "waist" | "bag" | "feet";
  export function slotsFor(kind: ItemKind): Slot[];          // dress → ["top","lower"]
  export function layerIndex(kind: ItemKind): number;         // spec order, 0 = drawn first
  export type ToggleResult = { selected: string[]; refused: boolean };
  export function toggleOutfitItem(selected: string[], id: string, kindOf: (id: string) => ItemKind | null): ToggleResult;
  ```

- [ ] **Step 1: Write the failing test** `outfit.test.ts`:
  - `"a dress takes the top and lower slots"`:
    - `slotsFor("dress")` equals `["top","lower"]`;
    - selecting a top while a dress is selected removes the dress;
    - selecting a dress removes both the top and the bottom.
  - `"same slot replaces"`: hat A then hat B gives `[B]`, and outer does not replace upper.
  - `"tapping a selected item removes it"`.
  - `"refuses a sixth showable item"`:
    - five showable items in different slots, then a sixth gives `refused:true` and the selection is unchanged;
    - an unplaceable item (kind null) is still added and doesn't count toward the cap.
  - `"layer order"`: sorting `["hat","bottom","outer","upper","watch","belt"]` by `layerIndex` gives `bottom, upper, outer, belt, watch, hat`. The full order is `bottom < dress < upper < outer < belt < bag < necklace < watch < shoes < earrings < glasses < hat`.

- [ ] **Step 2: Run it to verify it fails**
  - Run: `npx jest src/features/tryon/ar/__tests__/outfit.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement** `outfit.ts`. Slot map: upper→top, outer→outer, bottom→lower, dress→top+lower, hat→head, glasses→eyes, earrings→ears, necklace→neck, watch→wrist, belt→waist, bag→bag, shoes→feet. A new item removes every selected item that shares a slot, then the cap is checked on the result.

- [ ] **Step 4: Run tests.**
  - Run: `npx jest src/features/tryon/ar`
  - Expected: PASS.

- [ ] **Step 5: Commit**: `feat(tryon): add outfit slots, cap and layer order`, `test(tryon): cover outfit slot rules`.

### Task 4: Outfit store and entry points

**Files:**
- Modify: `src/features/tryon/ar/liveGarmentStore.ts`
- Modify: `src/app/(tabs)/scan.tsx:345-366` (`liveItem`, `startLiveTryOn`, `toggleClothing`) and its live button at `:813-836`
- Modify: `src/app/item/[id].tsx:156` (`canTryLive`) and `:236-250`
- Modify: `src/shared/i18n/en.ts`, `src/shared/i18n/fil.ts`: the `scan.tryon.pick_one` copy and a new `scan.tryon.outfit_full` toast
- Test: `src/features/tryon/ar/__tests__/liveGarment.test.ts` (rewrite)

**Interfaces:**
- Consumes: `itemKind`, `ItemKind` (Task 1); `toggleOutfitItem`, `MAX_LIVE_ITEMS` (Task 3).
- Produces:
  ```ts
  export interface LiveGarment { id: string; imageRef: string; category: string | null; name: string; kind: ItemKind | null }
  interface LiveGarmentState { garments: LiveGarment[]; set(garments: LiveGarment[]): void; clear(): void }
  export function liveOutfit<T extends { id: string; image_url: string | null; category: string | null; name: string | null; tags?: string[] | null; description?: string | null }>(
    selected: Iterable<string>, items: T[], fallbackName: string,
  ): LiveGarment[] | null;   // selection order; items without image skipped; null when no item has a kind
  export const useLiveGarment; // zustand, state above
  ```

- [ ] **Step 1: Rewrite the test** `liveGarment.test.ts` for `liveOutfit`:
  - `"keeps the selected items with images, in selection order, with kinds"`;
  - `"skips ids not in the list and items without an image"`;
  - `"is null when nothing selected can be placed"` (only a ring);
  - `"keeps an unplaceable item alongside placeable ones (kind null)"`;
  - `"uses the fallback name for an unnamed item"`.

- [ ] **Step 2: Run it to verify it fails**
  - Run: `npx jest src/features/tryon/ar/__tests__/liveGarment.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement the store.** Then wire the callers:
  - **`scan.tsx` toggle:** when `!PHOTO_TRYON_AVAILABLE`, `toggleClothing` uses `toggleOutfitItem` with `kindOf = id => itemKind(closetItems.find(i => i.id === id) ?? {category:null})`. When `refused`, call `toast.info(t("scan.tryon.outfit_full"))`.
  - **`scan.tsx` live button:** `liveItem` becomes `const outfit = liveOutfit(selectedClothing, closetItems, t("scan.item_fallback"))`, and `startLiveTryOn` calls `useLiveGarment.getState().set(outfit)`.
  - **`item/[id].tsx`:** `canTryLive = !!item.image_url && itemKind(item) !== null`, and the button sets a one-item outfit.
  - **Copy:**
    - `scan.tryon.pick_one` → en "Pick up to 5 items to try on live" / fil "Pumili ng hanggang 5 item para subukan nang live";
    - `scan.tryon.outfit_full` → en "You can try up to 5 items at once" / fil "Hanggang 5 item lang ang puwedeng subukan nang sabay".

- [ ] **Step 4: Run** `npx tsc --noEmit` and `npx jest src/features/tryon`.
  - Expected: no output from `tsc`. Jest passes.
  - `live.tsx` won't type-check until Task 7. In this task, change `live.tsx` only as far as `const garment = useLiveGarment((s) => s.garments[0] ?? null)` so it compiles; Task 7 replaces it.

- [ ] **Step 5: Commit**: one commit per file (`feat(tryon): hold a live outfit instead of one garment`, `feat(scan): select a live outfit of up to 5 items`, `feat(item): open any placeable item in the live preview`, `feat(i18n): add outfit selection copy`, `test(tryon): cover live outfit selection`).

### Task 5: Framing for mixed outfits

**Files:**
- Modify: `src/features/tryon/ar/framing.ts`
- Modify: `src/features/tryon/ar/useLiveTracker.ts:140-142, 237` (the `category` param becomes `kinds`)
- Test: `src/features/tryon/ar/__tests__/framing.test.ts`

**Interfaces:**
- Consumes: `ItemKind` (Task 1).
- Produces:
  - `export function framingHint(kinds: ItemKind[], keypoints: Keypoint[]): FramingHint` ("worklet").
  - `useLiveTracker({ active, facing, preview, kinds: ItemKind[] })`.

- [ ] **Step 1: Update the tests.**
  - **Existing calls:** `"Tops"` → `["upper"]`, `"Dresses"` → `["dress"]`, `"Bottoms"` → `["bottom"]`, with unchanged expectations.
  - **New cases:**
    - `"needs the union of joints"`: `["hat","shoes"]` with the ankles at y 0.98 (off the bottom) and the eyes in view gives `step_back`;
    - `"head-only outfits skip the body-span check"`: `["glasses"]` with only the eyes and ears visible and in the safe zone gives `good`, not `come_closer`;
    - `"watch needs the elbows and wrists"`: `["watch"]` with no wrists gives `step_back`;
    - `"empty kinds is good once a person is seen"`.

- [ ] **Step 2: Run** `npx jest src/features/tryon/ar/__tests__/framing.test.ts`.
  - Expected: FAIL (type errors on the new signature).

- [ ] **Step 3: Implement.**
  - `REQUIRED: Record<ItemKind, string[]>`:
    - upper/outer `["shoulder","hip"]`;
    - dress `["shoulder","hip","knee"]`;
    - bottom `["hip","knee","ankle"]`;
    - hat `["eye","ear"]`, glasses `["eye"]`, earrings `["ear"]`;
    - necklace `["shoulder"]`, watch `["elbow","wrist"]`;
    - belt/bag `["hip"]`, shoes `["ankle"]`.
  - Use the de-duplicated union of the required joints.
  - Replace `kind !== "bottom"` with `!joints.includes("ankle")`.
  - Apply `MIN_BODY_SPAN` only when the union has a joint other than eye and ear.
  - Update `useLiveTracker` to pass `kinds` into the worklet. Add `kinds.join(",")` to the `useMemo` deps, not the array identity.

- [ ] **Step 4: Run** `npx jest src/features/tryon/ar`.
  - Expected: PASS.

- [ ] **Step 5: Commit**: `feat(tryon): frame for every item in the outfit`, `refactor(tryon): pass outfit kinds to the live tracker`, `test(tryon): cover mixed-outfit framing`.

### Task 6: Outfit status line

**Files:**
- Modify: `src/features/tryon/ar/liveStatus.ts`
- Modify: `src/shared/i18n/en.ts`, `src/shared/i18n/fil.ts` (`tryon.live.*`)
- Test: `src/features/tryon/ar/__tests__/liveStatus.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ItemCutout = { name: string; placeable: boolean; cutout: CutoutState };
  export type LiveStatus = { key: LiveStatusKey; names?: string } | null;
  export function liveStatus(items: ItemCutout[], anyPlaced: boolean, tracker: TrackerState): LiveStatus;
  ```
  `LiveStatusKey` adds `"tryon.live.cant_show"` (some items unplaceable or failed) and keeps the existing keys.

- [ ] **Step 1: Write the tests.** Most important first:
  - every item unplaceable → `unsupported`;
  - tracker failed → `tracker_failed`;
  - tracker loading → `loading`;
  - all cut-outs still loading → `cutout_loading`;
  - every placeable cut-out failed → `cutout_failed`;
  - one item failed or unplaceable while the others are ready → `{key:"tryon.live.cant_show", names:"Ring, Scarf"}` (joined with ", " in selection order);
  - all ready → null.
  - Keep a one-item `liveStatusKey` wrapper only if `RealisticView` or anything else still calls it. Otherwise delete it and its test.

- [ ] **Step 2: Run** `npx jest src/features/tryon/ar/__tests__/liveStatus.test.ts`.
  - Expected: FAIL.

- [ ] **Step 3: Implement.** Add the copy:
  - `tryon.live.cant_show`: en "Can't show {names} live" / fil "Hindi maipakita nang live ang {names}".
  - `tryon.live.unsupported`: en "Live preview works with clothes, shoes, bags, hats, glasses, earrings, necklaces, scarves, watches and belts." / fil "Gumagana ang live preview sa damit, sapatos, bag, sumbrero, salamin, hikaw, kwintas, scarf, relo at sinturon."

- [ ] **Step 4: Run** `npx jest src/features/tryon`.
  - Expected: PASS.

- [ ] **Step 5: Commit**: `feat(tryon): report which outfit items can't be shown`, `feat(i18n): add outfit status copy`, `test(tryon): cover outfit status`.

### Task 7: One canvas for the outfit and the live screen

**Files:**
- Modify: `src/features/tryon/ar/LiveGarmentLayer.tsx` → rename to `LiveOutfitLayer.tsx` (`git mv`)
- Modify: `src/app/tryon/live.tsx`

**Interfaces:**
- Consumes: `meshFit`, `isMeshKind` (Task 1); `accessoryFit`, `quadsToMesh` (Task 2); `layerIndex` (Task 3); `useLiveGarment().garments` (Task 4); `framingHint` kinds / `useLiveTracker({kinds})` (Task 5); `liveStatus` (Task 6).
- Produces:
  ```ts
  export interface OutfitLayerItem { id: string; kind: ItemKind; image: SkImage; bounds: Bounds }
  export function LiveOutfitLayer(props: { items: OutfitLayerItem[]; keypoints: SharedValue<Keypoint[] | null>; facing: "front" | "back"; onAnyPlaced?: (placed: boolean) => void }): JSX.Element;
  export function useGarmentBounds(image: SkImage | null): Bounds; // unchanged
  ```

- [ ] **Step 1: Implement `LiveOutfitLayer`.**
  - **Canvas:** one `<Canvas>` with one `<Vertices>` + `<ImageShader>` child per item, in `layerIndex` order.
  - **One fit pass:** a single `useAnimatedReaction` on `keypoints` fits every item. Mesh kinds use `meshFit`; accessories use `accessoryFit` then `quadsToMesh`.
  - **Hold and fade:** stores each item's held mesh and lost time in shared-value arrays indexed by item. Keep the hold/fade constants: `HOLD_MS` 300, `FADE_MS` 200, `OPACITY` 0.95, and no fade with reduce motion.
  - **Back camera:** apply the existing back-camera texture flip to every item.
  - **Placed report:** pushes `onAnyPlaced` at most every `PUSH_INTERVAL_MS` (250 ms).
  - **Item limit:** items are capped at `MAX_LIVE_ITEMS`, so a fixed set of up to 5 `useDerivedValue` slots is allowed. Hooks must not change count between renders: always allocate 5 and render only the occupied ones.

- [ ] **Step 2: Rewrite the `live.tsx` data flow.**
  - **Cut-outs:** `garments` comes from the store. Cut-outs are fetched for all items in parallel (`getGarmentCutout` each), keyed by `id|imageRef`.
  - **Images:** per-item `useImage` uses 5 fixed hook slots, the same reason as above.
  - **Sheet:** shows the first item's thumbnail and "{n} items" when n > 1. Add `tryon.live.items_count`: en "{count} items" / fil "{count} item".
  - **Tracker:** active while `≥1` item is ready and placeable.
  - **Status:** comes from `liveStatus`.
  - **Navigation:** go back when `garments` is empty.

- [ ] **Step 3: Verify.**
  - Run: `npx tsc --noEmit`, `npm test`, `npm run lint`, then `npx expo export --platform android --output-dir <scratch>`.
  - Expected: no `tsc` output, all suites pass, 0 lint errors, "Android Bundled". Delete the export afterwards.

- [ ] **Step 4: Commit**: `feat(tryon): draw the whole outfit on one canvas`, `feat(tryon): run the live screen on an outfit`, `feat(i18n): add outfit item count`.

### Task 8: "Go realistic" item picker

**Files:**
- Modify: `src/features/tryon/realistic/RealisticView.tsx` (add `RealisticItemPicker`)
- Modify: `src/app/tryon/live.tsx`
- Modify: `src/shared/i18n/en.ts`, `src/shared/i18n/fil.ts`

**Interfaces:**
- Consumes: `useRealisticSession(cutoutUri, facing)` (unchanged); the per-item ready cut-out URIs from Task 7.
- Produces: `export function RealisticItemPicker(props: { visible: boolean; items: { id: string; name: string; thumbUri: string | null }[]; onPick(id: string): void; onClose(): void }): JSX.Element`, built on the themed `Sheet` like `RealisticConsentSheet`.

- [ ] **Step 1: Implement.**
  - **One ready item:** "Go realistic" behaves as today.
  - **Several ready items:**
    - it opens `RealisticItemPicker`;
    - picking an item sets `realisticItemId`, and `useRealisticSession` gets that item's cut-out URI;
    - `start()` runs after the pick, and consent still shows first when needed.
  - **Hiding the AR:** while realistic mode runs, the AR outfit is hidden, as today. "Back to live preview" clears `realisticItemId`.
  - **Picker copy:**
    - title `tryon.live.realistic_pick_title`: en "Pick one item" / fil "Pumili ng isang item";
    - note `tryon.live.realistic_pick_note`: en "Realistic mode redraws your video with AI. It isn't 3D and may change details." / fil "Ginuguhit muli ng AI ang video mo sa realistic mode. Hindi ito 3D at puwedeng magbago ang ilang detalye.".

- [ ] **Step 2: Verify.**
  - Run: `npx tsc --noEmit`, `npm test`, `npm run lint`.
  - Expected: clean, 0 errors.

- [ ] **Step 3: Commit**: `feat(tryon): pick which outfit item goes realistic`, `feat(tryon): wire the realistic item picker`, `feat(i18n): add realistic item picker copy`.

### Task 9: Phone build and checklist

**Files:** none in the repo (build copy `C:\o`).

- [ ] **Step 1:** Run the full `/verify` suite, including backend pytest.
  - Expected: all pass.
- [ ] **Step 2:** Sync to the build copy.
  - Run: `cp -r src/. /c/o/src/ && cp app.json index.ts /c/o/ && cp -r plugins/. /c/o/plugins/`
- [ ] **Step 3: Native rebuild.** Only needed if `package.json` or `app.json` changed; this plan adds no native dependencies.
  - Run: `cd /c/o/android && ANDROID_HOME=$LOCALAPPDATA/Android/Sdk ./gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --offline`
  - Then install: `adb install -r app/build/outputs/apk/debug/app-debug.apk`.
- [ ] **Step 4: Phone checklist.** The user runs Metro with `npx expo start --dev-client`; Claude records logcat and reads the `ReactNativeJS` lines:
  - hat + top + pants + watch, front and back camera;
  - a shoe pair photo vs a single-shoe photo;
  - 5 items: `[LiveTracker] fps=` compared with the one-item run;
  - "Go realistic" picker with a top, then with a hat.
