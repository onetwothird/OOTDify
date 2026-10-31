import type { ClothingItem } from "../../clothing/types";
import { clearSlot, hintsFor, missingSlots, pick, piecesFor, slotOf, toOutfit, visibleSlots } from "../manualOutfit";

function item(id: string, category: string | null, extra: Partial<ClothingItem> = {}): ClothingItem {
  return {
    id,
    user_id: "u",
    clothing_id: null,
    name: id,
    category,
    color: null,
    size: null,
    style: null,
    brand: null,
    season: null,
    occasion: [],
    image_url: null,
    tags: [],
    wear_count: 0,
    last_worn: null,
    created_at: "2026-10-31T00:00:00Z",
    ...extra,
  };
}

describe("slotOf", () => {
  it("maps wardrobe categories", () => {
    expect(slotOf({ category: "Tops" })).toBe("top");
    expect(slotOf({ category: "Dresses" })).toBe("dress");
    expect(slotOf({ category: "Outerwear" })).toBe("layer");
    expect(slotOf({ category: "Bags" })).toBe("bag");
  });
  it("reads free-text categories", () => {
    expect(slotOf({ category: "Sneakers" })).toBe("shoes");
    expect(slotOf({ category: "denim jeans" })).toBe("bottom");
    expect(slotOf({ category: "Blazer" })).toBe("layer");
  });
  it("is null when unknown or empty", () => {
    expect(slotOf({ category: "Other" })).toBeNull();
    expect(slotOf({ category: null })).toBeNull();
  });
});

describe("pick", () => {
  it("a dress replaces top and bottom", () => {
    expect(pick({ top: "t", bottom: "b", shoes: "s" }, "dress", "d")).toEqual({ shoes: "s", dress: "d" });
  });
  it("a top replaces a dress", () => {
    expect(pick({ dress: "d" }, "top", "t")).toEqual({ top: "t" });
  });
  it("one piece fills one slot", () => {
    expect(pick({ top: "x" }, "layer", "x")).toEqual({ layer: "x" });
  });
  it("clearSlot empties only that slot", () => {
    expect(clearSlot({ top: "t", shoes: "s" }, "top")).toEqual({ shoes: "s" });
  });
});

describe("missingSlots / visibleSlots", () => {
  it("needs top, bottom and shoes", () => {
    expect(missingSlots({})).toEqual(["top", "bottom", "shoes"]);
  });
  it("a dress covers top and bottom", () => {
    expect(missingSlots({ dress: "d" })).toEqual(["shoes"]);
    expect(visibleSlots({ dress: "d" })).not.toContain("top");
  });
  it("hides the dress slot once a top is chosen", () => {
    expect(visibleSlots({ top: "t" })).not.toContain("dress");
  });
});

describe("piecesFor", () => {
  const items = [item("t", "Tops"), item("s", "Shoes")];
  it("filters by slot, or shows all", () => {
    expect(piecesFor("top", items).map((i) => i.id)).toEqual(["t"]);
    expect(piecesFor("top", items, true)).toHaveLength(2);
  });
});

describe("hintsFor", () => {
  it("lists what's missing", () => {
    const items = [item("t", "Tops")];
    expect(hintsFor({ top: "t" }, items, null)).toEqual([{ kind: "missing", slots: ["bottom", "shoes"] }]);
  });
  it("flags more than two bold colours but not neutrals", () => {
    const items = [
      item("t", "Tops", { color: "Red" }),
      item("b", "Bottoms", { color: "Green" }),
      item("s", "Shoes", { color: "Yellow" }),
      item("l", "Outerwear", { color: "Black" }),
    ];
    const hints = hintsFor({ top: "t", bottom: "b", shoes: "s", layer: "l" }, items, null);
    expect(hints).toEqual([{ kind: "too_many_colors", colors: ["red", "green", "yellow"] }]);
  });
  it("flags a piece tagged for other occasions", () => {
    const items = [
      item("t", "Tops", { name: "Gym tee", occasion: ["Sport"] }),
      item("b", "Bottoms"),
      item("s", "Shoes"),
    ];
    expect(hintsFor({ top: "t", bottom: "b", shoes: "s" }, items, "Office")).toEqual([
      { kind: "occasion", pieceName: "Gym tee", occasions: ["Sport"] },
    ]);
  });
  it("says complete when nothing is off", () => {
    const items = [item("t", "Tops"), item("b", "Bottoms"), item("s", "Shoes")];
    expect(hintsFor({ top: "t", bottom: "b", shoes: "s" }, items, "Casual")).toEqual([{ kind: "complete" }]);
  });
});

describe("toOutfit", () => {
  it("keeps slot order and scores the look", () => {
    const items = [item("s", "Shoes"), item("t", "Tops"), item("b", "Bottoms")];
    const outfit = toOutfit({ shoes: "s", top: "t", bottom: "b" }, items, "Casual", new Date(0));
    expect(outfit.items.map((e) => e.id)).toEqual(["t", "b", "s"]);
    expect(outfit.items.every((e) => e.source === "item")).toBe(true);
    expect(outfit.score).toBeGreaterThan(0);
  });
});
