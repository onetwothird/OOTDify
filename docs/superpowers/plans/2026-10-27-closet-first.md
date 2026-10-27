# Closet-First App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stock catalog with the user's own captured, background-removed clothes everywhere. Recommendations, outfit ideas, browsing and try-on all run on the closet, and the live preview is the only try-on shown.

**Architecture:** The backend's recommender and outfit composer are pure functions over item rows. The two routes feed them the signed-in user's `clothing_items`, mapped to the candidate shape, instead of `clothing` rows. The app removes every catalog list. Discover becomes "My closet", reusing its search/chip/grid layout. Saved outfits resolve piece ids against the closet first, then the legacy catalog, so existing outfits keep their pictures. Photo try-on is hidden behind an app constant until a real VTON model is implemented.

**Tech Stack:** Flask + Supabase service-role client (backend), Expo SDK 58 / expo-router / zustand (app), pytest and Jest.

**Spec:** the user's request in this session: "remove the preset images… capture a specific image… clothes only, no background… try it on virtually". Decisions: remove presets **everywhere**; **live preview only** for try-on; Discover becomes **My closet**. Capture with background removal already exists (`FEATURE_GUIDE.md` §3). Live try-on exists (`docs/superpowers/plans/2026-10-27-live-tryon-overlay.md`).

## Global Constraints

- No database changes and no deleted rows. The `clothing` table, the ingestion script and `src/app/catalog/[id].tsx` stay, so existing saved outfits that reference catalog ids still open. Nothing in the app lists or browses catalog items any more.
- The closet loader filters by the user id from the validated token (`require_user()["id"]`), never from the request body.
- Copy: sentence case, no spaced em dashes. Every new string goes in both `en.ts` and `fil.ts`.
- Empty closet: every screen says what to do ("Capture a few clothes…") and offers the capture flow (`useCaptureModalStore`). It never shows an error or a blank area.
- Photo try-on: `PHOTO_TRYON_AVAILABLE = false` in `src/features/tryon/config.ts`. When false, Scan hides the body-photo picker and "Start try-on", and shows the not-available note. Past jobs still list if any exist.
- Branch `feat/closet-first` from `feat/live-tryon` (it needs the live preview).
- Area rules in `.claude/rules/` apply. Verify with `/verify` (tsc, Jest, lint 0 errors, backend pytest).

## Review Focus

1. **Saved outfits built from catalog items** (existing data) still show their pieces and open the legacy product page. Test: Task 2 `orderPieces` with mixed and missing ids.
2. **Empty or tiny closet:** Home, Outfits, AI picker and Discover all show the capture call to action, not an error. Test: Task 1 empty-closet route responses; Task 5 `filterCloset` on an empty list.
3. **Closet rows with missing fields** (no category, colour, size, image) don't crash scoring or composing. Test: Task 1 mapping with `None` fields, plus a route test.
4. **Another user's clothes never appear:** the loader is called with the token's user id. Test: Task 1 route tests assert the loader argument and that the catalog loader is never called.
5. **Private closet image refs** render on Home, AI picker and Discover (via `SmartImage`/`ClothingCard`, which re-sign refs). The reviewer checks that no screen passes a closet `image_url` straight to `expo-image`.

---

### Task 1: Backend recommendations and outfits from the closet

**Files:**
- Modify: `backend/services/catalog_service.py` (add closet loader and mapper next to `load_candidates`)
- Modify: `backend/routes/recommend.py`, `backend/routes/outfits.py`
- Test: `backend/tests/test_closet_candidates.py`

**Interfaces:**
- Produces: `closet_row_to_candidate(row: dict) -> dict`, which returns `{"id", "name", "category", "subcategory": None, "gender": "unisex", "color": [color] or [], "sizes": [size] or [], "style", "brand", "occasion": list, "image_url", "source": "closet"}`. `name` falls back to `category`, then `"Item"`.
- Produces: `load_closet_candidates(user_id: str, limit: int = 500) -> list[dict]`: service-role select from `clothing_items` `.eq("user_id", user_id)`, mapped. Returns `[]` when Supabase isn't configured, the same way `load_candidates` does.
- HTTP (unchanged shape): `/api/recommend` → `{success, recommendations: [...candidates with score], occasion}`. `/api/outfits` → as today. With an empty closet: `pool: 0, outfits: [], reason: "Your closet is empty. Capture a few clothes first."`

- [ ] **Step 1: Failing tests.** Mapping: full row; a row with every optional field `None` (`color: []`, `sizes: []`, `occasion: []`, name `"Item"`). Routes, using the `test_isolate_route.py` fixture pattern with `recommend_bp`/`outfits_bp`, `routes.users.ensure_profile` patched to return `{}`, and `load_candidates` patched to raise:
  - `test_recommend_uses_callers_closet`: the loader is called with `"user-1"`, and the returned ids are closet ids.
  - `test_recommend_empty_closet`: `200`, `recommendations == []`.
  - `test_outfits_empty_closet_reason`: `pool == 0`, the reason text as above.
  - `test_outfits_compose_from_closet`: 4 closet rows (top, bottom, shoes, outerwear) produce at least one outfit whose item ids are all closet ids.
  - `test_missing_fields_do_not_crash`: rows with `None` category/colour score without raising.
- [ ] **Step 2:** `cd backend && .venv/Scripts/python -m pytest tests/test_closet_candidates.py -q` → FAIL (import error / catalog loader called).
- [ ] **Step 3:** Implement the loader and mapper. Swap both routes to `load_closet_candidates(user["id"])`. Update the module docstrings ("composed from your closet").
- [ ] **Step 4:** Full backend suite → all pass.
- [ ] **Step 5:** Commit per file.

### Task 2: Saved-outfit pieces from closet or legacy catalog

**Files:**
- Create: `src/features/clothing/pieces.ts`
- Test: `src/features/clothing/__tests__/pieces.test.ts`
- Modify: `src/features/clothing/service.ts` (add `fetchOutfitPieces`)
- Modify: `src/app/(tabs)/outfits.tsx` (hydration at `:125-143`), `src/app/outfit/[id].tsx` (`fetchCatalogish`, `:154`)

**Interfaces:**
- Produces (pure, `pieces.ts`, no supabase import):
```ts
export interface OutfitPiece { id: string; name: string | null; category: string | null; image_url: string | null; source: "closet" | "catalog" }
export function orderPieces(ids: string[], closet: OutfitPiece[], catalog: OutfitPiece[]): OutfitPiece[]; // keeps ids order, closet wins, drops unknown ids
export function pieceHref(piece: Pick<OutfitPiece, "id" | "source">): `/item/${string}` | `/catalog/${string}`;
```
- Produces (`service.ts`): `fetchOutfitPieces(ids: string[]): Promise<OutfitPiece[]>`. It queries `clothing_items` for the ids first, then `fetchCatalog({ ids: missing })` only for ids that weren't found.

- [ ] **Step 1: Failing tests:** order preserved; closet wins on a duplicate id; unknown ids dropped; empty input → `[]`; `pieceHref` for both sources.
- [ ] **Step 2:** `npx jest src/features/clothing` → FAIL.
- [ ] **Step 3:** Implement `pieces.ts` and `fetchOutfitPieces`. Replace both screens' catalog-only hydration, and link each piece with `pieceHref`.
- [ ] **Step 4:** `npx tsc --noEmit`, `npm test` → pass.
- [ ] **Step 5:** Commit per file.

### Task 3: Home without catalog

**Files:** Modify `src/app/(tabs)/home.tsx`, `src/shared/i18n/en.ts`, `fil.ts`.

- Remove the Trending section and its `fetchCatalog` load and state.
- Recommended cards open `pieceHref({ id, source: "closet" })`.
- Empty recommendations: `home.recommended.empty_closet`: "Capture a few clothes and we'll suggest looks from your closet." plus a **"Capture clothes"** button (`useCaptureModalStore` open, as Profile does).
- [ ] Implement. `tsc`, lint, Jest. Commit per file.

### Task 4: Outfits tab and AI picker on the closet

**Files:** Modify `src/app/(tabs)/outfits.tsx`, `src/app/ai-picker.tsx`, i18n files.

- Every piece link uses `pieceHref` (`outfits.tsx:463`, `ai-picker.tsx:164`).
- When `/api/outfits` returns `pool: 0` or no outfits, show its `reason` (or `outfits.empty_closet`: "Your closet needs a top, a bottom and shoes for full looks.") with a **"Capture clothes"** button.
- [ ] Implement. `tsc`, lint, Jest. Commit per file.

### Task 5: Discover becomes My closet

**Files:**
- Create: `src/features/wardrobe/filter.ts`, test `src/features/wardrobe/__tests__/filter.test.ts`
- Modify: `src/app/(tabs)/discover.tsx` (data source + copy), `src/app/(tabs)/_layout.tsx` (tab label "Closet", icon `shirt-outline`), i18n files

**Interfaces:**
- Produces: `filterCloset(items: ClothingItem[], query: string, category: string | null): ClothingItem[]`. Case-insensitive match on name, brand, colour and category; `null` category means all. Keeps input order.
- Screen: `useWardrobeStore` items (load on focus), search box, `WARDROBE_CATEGORIES` chips, `ClothingCard` grid → `/item/{id}`, header "My closet" with a **"Capture clothes"** button. Empty closet: "Your closet is empty. Capture clothes to see them here." Empty filter result: "No clothes match. Try another search or category."

- [ ] **Step 1: Failing tests:** query matches name/brand/colour/category; category filter; both combined; empty items → `[]`; whitespace query = no filter.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** pass. `tsc`, lint.
- [ ] **Step 5:** Commit per file.

### Task 6: Scan and item page: own clothes and live preview only

**Files:**
- Create: `src/features/tryon/config.ts` (`export const PHOTO_TRYON_AVAILABLE = false;` with a comment pointing at `VTONProvider.generate()`)
- Modify: `src/app/(tabs)/scan.tsx`, `src/app/item/[id].tsx`, i18n files

- Scan: drop the Catalog/Closet switch, `catalogItems` and `fetchCatalog`. The try-on card lists closet items ("Your clothes") with a **"Capture clothes"** tile. Catalog preselection from the selection store is ignored; closet preselection still works.
  - With `!PHOTO_TRYON_AVAILABLE`: hide the body-photo section and "Start try-on", and show `scan.tryon.photo_unavailable`: "Realistic photo try-on isn't available yet. Use Try it live to see clothes on you." "Try it live" becomes the primary button.
  - Past jobs still list when `jobs.length > 0`.
- Item page: add **"Try it live"** when `garmentFit(category, []).kind !== "unsupported"` and the item has an image. It sets `useLiveGarment` and pushes `/tryon/live`.
- [ ] Implement. `tsc`, lint, Jest. Commit per file.

### Task 7: Docs

**Files:** `REMAINING_TASKS.md` (new section: what changed, phone checklist), `FEATURE_GUIDE.md` §4 (photo try-on hidden behind `PHOTO_TRYON_AVAILABLE`).
- Phone checklist: empty closet everywhere; capture 4 items and see Home suggestions plus an AI picker look; old saved outfit still shows its pieces; Discover search/filter; item → Try it live.
- [ ] Write. Run `/verify` (full). Commit per file.
