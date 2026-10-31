// C:\OOTDify\src\features\outfit\manualOutfit.ts
// The user builds an outfit slot by slot from their own closet. Pure logic, no
// React: which slot a piece belongs to, what picking a piece does to the other
// slots (a dress replaces top + bottom), what the look still needs, and
// concrete hints about the pieces chosen. The AI does not choose anything here.
import type { ClothingItem } from "../clothing/types";
import { scoreOutfit } from "./compatibility";
import type { Outfit } from "./types";

export type SlotKey = "top" | "bottom" | "dress" | "shoes" | "layer" | "accessory" | "bag";

/** Slots in the order they're shown, with the closet categories that fill them. */
export const SLOTS: { key: SlotKey; categories: string[]; optional: boolean }[] = [
  { key: "top", categories: ["tops"], optional: false },
  { key: "bottom", categories: ["bottoms"], optional: false },
  { key: "dress", categories: ["dresses"], optional: true },
  { key: "shoes", categories: ["shoes"], optional: false },
  { key: "layer", categories: ["outerwear"], optional: true },
  { key: "accessory", categories: ["accessories"], optional: true },
  { key: "bag", categories: ["bags"], optional: true },
];

// Words in a free-text category that still tell us the slot.
const KEYWORDS: [SlotKey, string[]][] = [
  ["dress", ["dress", "jumpsuit", "romper"]],
  ["shoes", ["shoe", "sneaker", "boot", "sandal", "heel", "loafer", "slipper"]],
  ["layer", ["jacket", "coat", "blazer", "cardigan", "hoodie", "outer"]],
  ["bottom", ["bottom", "pant", "jean", "skirt", "short", "trouser", "legging"]],
  ["top", ["top", "shirt", "tee", "blouse", "polo", "sweater", "tank"]],
  ["bag", ["bag", "purse", "tote", "backpack"]],
  ["accessory", ["accessor", "hat", "cap", "belt", "watch", "scarf", "glasses", "jewel", "necklace", "earring"]],
];

export type Picks = Partial<Record<SlotKey, string>>;

export function slotOf(item: Pick<ClothingItem, "category">): SlotKey | null {
  const cat = (item.category ?? "").trim().toLowerCase();
  if (!cat) return null;
  const exact = SLOTS.find((s) => s.categories.includes(cat));
  if (exact) return exact.key;
  for (const [slot, words] of KEYWORDS) if (words.some((w) => cat.includes(w))) return slot;
  return null;
}

/** The closet pieces that fit a slot (or every piece, for "show all"). */
export function piecesFor(slot: SlotKey, items: ClothingItem[], showAll = false): ClothingItem[] {
  return showAll ? items : items.filter((it) => slotOf(it) === slot);
}

/** Put `id` in `slot`. A dress replaces top and bottom, and the reverse. */
export function pick(picks: Picks, slot: SlotKey, id: string): Picks {
  const next: Picks = { ...picks, [slot]: id };
  if (slot === "dress") {
    delete next.top;
    delete next.bottom;
  }
  if (slot === "top" || slot === "bottom") delete next.dress;
  // The same piece can't fill two slots.
  for (const key of Object.keys(next) as SlotKey[]) {
    if (key !== slot && next[key] === id) delete next[key];
  }
  return next;
}

export function clearSlot(picks: Picks, slot: SlotKey): Picks {
  const next = { ...picks };
  delete next[slot];
  return next;
}

/** What a complete look still needs: a top and bottom (or a dress), and shoes. */
export function missingSlots(picks: Picks): SlotKey[] {
  const missing: SlotKey[] = [];
  if (!picks.dress) {
    if (!picks.top) missing.push("top");
    if (!picks.bottom) missing.push("bottom");
  }
  if (!picks.shoes) missing.push("shoes");
  return missing;
}

/** Slots to show: a chosen dress hides top and bottom, a top or bottom hides the dress. */
export function visibleSlots(picks: Picks): SlotKey[] {
  return SLOTS.map((s) => s.key).filter((key) => {
    if (picks.dress && (key === "top" || key === "bottom")) return false;
    if ((picks.top || picks.bottom) && key === "dress") return false;
    return true;
  });
}

const NEUTRALS = [
  "black", "white", "grey", "gray", "beige", "cream", "ivory", "navy", "brown",
  "tan", "khaki", "camel", "denim", "charcoal", "off-white", "nude",
];

function isNeutral(color: string): boolean {
  const c = color.toLowerCase();
  return NEUTRALS.some((n) => c.includes(n));
}

export type Hint =
  | { kind: "missing"; slots: SlotKey[] }
  | { kind: "too_many_colors"; colors: string[] }
  | { kind: "occasion"; pieceName: string; occasions: string[] }
  | { kind: "complete" };

/**
 * Concrete notes about the chosen pieces: what's missing, more than two bold
 * colours, and pieces tagged for other occasions than the one picked.
 */
export function hintsFor(picks: Picks, items: ClothingItem[], occasion: string | null): Hint[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  const chosen = Object.values(picks)
    .map((id) => (id ? byId.get(id) : undefined))
    .filter((it): it is ClothingItem => !!it);
  const hints: Hint[] = [];

  const missing = missingSlots(picks);
  if (missing.length) hints.push({ kind: "missing", slots: missing });

  const bold = Array.from(
    new Set(chosen.map((it) => (it.color ?? "").trim()).filter((c) => c && !isNeutral(c)).map((c) => c.toLowerCase())),
  );
  if (bold.length > 2) hints.push({ kind: "too_many_colors", colors: bold });

  if (occasion) {
    const want = occasion.toLowerCase();
    for (const it of chosen) {
      const tagged = (it.occasion ?? []).filter(Boolean);
      if (tagged.length && !tagged.some((o) => o.toLowerCase() === want)) {
        hints.push({ kind: "occasion", pieceName: it.name ?? "", occasions: tagged });
      }
    }
  }

  if (!hints.length && chosen.length) hints.push({ kind: "complete" });
  return hints;
}

/** The picks as an Outfit (closet entries, in slot order) with its score. */
export function toOutfit(picks: Picks, items: ClothingItem[], occasion: string | null, now: Date = new Date()): Outfit {
  const byId = new Map(items.map((it) => [it.id, it]));
  const entries = SLOTS.map((s) => picks[s.key])
    .filter((id): id is string => !!id && byId.has(id))
    .map((id) => ({ id, source: "item" as const, item: byId.get(id)! }));
  const outfit: Outfit = {
    id: `manual-${now.getTime()}`,
    items: entries,
    createdAt: now.toISOString(),
    occasion,
    score: 0,
  };
  outfit.score = scoreOutfit(outfit);
  return outfit;
}
