// Outfit rules for the live try-on: one item per body slot, at most
// MAX_LIVE_ITEMS showable items, and the order layers are drawn in. Pure and
// native-free.
import type { ItemKind } from "./itemKind";

export const MAX_LIVE_ITEMS = 5;

export type Slot = "top" | "outer" | "lower" | "head" | "eyes" | "ears" | "neck" | "wrist" | "waist" | "bag" | "feet";

const SLOTS: Record<ItemKind, Slot[]> = {
  upper: ["top"],
  outer: ["outer"],
  bottom: ["lower"],
  dress: ["top", "lower"],
  hat: ["head"],
  glasses: ["eyes"],
  earrings: ["ears"],
  necklace: ["neck"],
  watch: ["wrist"],
  belt: ["waist"],
  bag: ["bag"],
  shoes: ["feet"],
};

/** Drawn first to last: lower garments under tops, the hat on top. */
const LAYERS: ItemKind[] = [
  "bottom",
  "dress",
  "upper",
  "outer",
  "belt",
  "bag",
  "necklace",
  "watch",
  "shoes",
  "earrings",
  "glasses",
  "hat",
];

export function slotsFor(kind: ItemKind): Slot[] {
  return SLOTS[kind];
}

export function layerIndex(kind: ItemKind): number {
  "worklet";
  return LAYERS.indexOf(kind);
}

export type ToggleResult = { selected: string[]; refused: boolean };

/**
 * Tap `id` in the outfit picker: a selected item is removed; a new one
 * replaces every item sharing a slot with it. Adding a showable item past
 * MAX_LIVE_ITEMS is refused. Items with no kind are kept (the live screen
 * names them as unshowable) and don't count toward the cap.
 */
export function toggleOutfitItem(
  selected: string[],
  id: string,
  kindOf: (id: string) => ItemKind | null,
): ToggleResult {
  if (selected.includes(id)) return { selected: selected.filter((s) => s !== id), refused: false };
  const kind = kindOf(id);
  if (kind === null) return { selected: [...selected, id], refused: false };
  const taken = new Set(slotsFor(kind));
  const kept = selected.filter((s) => {
    const k = kindOf(s);
    return k === null || !slotsFor(k).some((slot) => taken.has(slot));
  });
  const next = [...kept, id];
  const showable = next.filter((s) => kindOf(s) !== null).length;
  if (showable > MAX_LIVE_ITEMS) return { selected, refused: true };
  return { selected: next, refused: false };
}
