import type { ItemKind } from "../itemKind";
import { layerIndex, MAX_LIVE_ITEMS, slotsFor, toggleOutfitItem } from "../outfit";

const KINDS: Record<string, ItemKind | null> = {
  top: "upper",
  top2: "upper",
  jacket: "outer",
  pants: "bottom",
  dress: "dress",
  hatA: "hat",
  hatB: "hat",
  watch: "watch",
  shoes: "shoes",
  belt: "belt",
  glasses: "glasses",
  ring: null,
};
const kindOf = (id: string) => KINDS[id] ?? null;
const toggle = (selected: string[], id: string) => toggleOutfitItem(selected, id, kindOf);

describe("outfit slots", () => {
  it("a dress takes the top and lower slots", () => {
    expect(slotsFor("dress")).toEqual(["top", "lower"]);
    expect(toggle(["dress"], "top")).toEqual({ selected: ["top"], refused: false });
    expect(toggle(["top", "pants", "hatA"], "dress")).toEqual({ selected: ["hatA", "dress"], refused: false });
  });

  it("same slot replaces", () => {
    expect(toggle(["hatA"], "hatB").selected).toEqual(["hatB"]);
    expect(toggle(["top"], "top2").selected).toEqual(["top2"]);
    expect(toggle(["top"], "jacket").selected).toEqual(["top", "jacket"]);
  });

  it("tapping a selected item removes it", () => {
    expect(toggle(["top", "watch"], "top")).toEqual({ selected: ["watch"], refused: false });
  });

  it("refuses a sixth showable item", () => {
    const five = ["top", "jacket", "pants", "hatA", "watch"];
    expect(five).toHaveLength(MAX_LIVE_ITEMS);
    expect(toggle(five, "shoes")).toEqual({ selected: five, refused: true });
    // Replacing within a slot is never refused.
    expect(toggle(five, "hatB")).toEqual({ selected: ["top", "jacket", "pants", "watch", "hatB"], refused: false });
  });

  it("an unplaceable item is added and doesn't count toward the cap", () => {
    const five = ["top", "jacket", "pants", "hatA", "watch"];
    expect(toggle(five, "ring")).toEqual({ selected: [...five, "ring"], refused: false });
    expect(toggle([...five, "ring"], "shoes").refused).toBe(true);
  });
});

describe("layerIndex", () => {
  it("orders the layers bottom to top", () => {
    const kinds: ItemKind[] = ["hat", "bottom", "outer", "upper", "watch", "belt"];
    expect([...kinds].sort((a, b) => layerIndex(a) - layerIndex(b))).toEqual(["bottom", "upper", "outer", "belt", "watch", "hat"]);
    const all: ItemKind[] = ["bottom", "dress", "upper", "outer", "belt", "bag", "necklace", "watch", "shoes", "earrings", "glasses", "hat"];
    for (let i = 1; i < all.length; i++) expect(layerIndex(all[i])).toBeGreaterThan(layerIndex(all[i - 1]));
  });
});
