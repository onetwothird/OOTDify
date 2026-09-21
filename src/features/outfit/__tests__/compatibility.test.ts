import { scoreOutfit } from "../compatibility";
import { OutfitEntry } from "../types";

function makeEntry(category: string): OutfitEntry {
  return {
    id: `id-${category}`,
    source: "catalog",
    item: { id: `id-${category}`, name: category, category } as any,
  };
}

function makeOutfit(categories: string[]): any {
  return { items: categories.map(makeEntry) } as any;
}

describe("scoreOutfit", () => {
  test("scores between 0 and 100", () => {
    const s = scoreOutfit(make(["Tops", "Bottoms", "Shoes"]));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  test("is deterministic (no randomness)", () => {
    const a = scoreOutfit(make(["Tops", "Bottoms"]));
    const b = scoreOutfit(make(["Tops", "Bottoms"]));
    expect(a).toBe(b);
  });

  test("returns 0 for an empty outfit", () => {
    expect(scoreOutfit({ items: [] } as any)).toBe(0);
  });

  test("unmatched categories score lower than a full outfit", () => {
    const bare = scoreOutfit(make(["Shoes"]));
    const full = scoreOutfit(make(["Tops", "Bottoms", "Shoes"]));
    expect(full).toBeGreaterThan(bare);
  });
});

function make(categories: string[]) { return makeOutfit(categories); }