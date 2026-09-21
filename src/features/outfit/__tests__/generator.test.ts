import { generateOutfits } from "../generator";

const wardrobe = [
  { id: "a", name: "A", category: "Tops", color: [], occasion: ["Casual"] },
  { id: "b", name: "B", category: "Bottoms", color: [], occasion: ["Casual"] },
  { id: "c", name: "C", category: "Outerwear", color: [], occasion: ["Casual"] },
  { id: "d", name: "D", category: "Shoes", color: [], occasion: ["Casual"] },
] as any;

describe("generateOutfits", () => {
  test("returns at least one outfit with real ids", async () => {
    const outs = await generateOutfits(wardrobe, { seed: 7 });
    expect(outs.length).toBeGreaterThan(0);
    expect(outs[0].items.length).toBeGreaterThan(0);
    for (const entry of outs[0].items) {
      expect(typeof entry.id).toBe("string");
      expect(entry.item?.id).toBeTruthy();
    }
  });

  test("considers temperature when cold (outerwear included)", async () => {
    const outs = await generateOutfits(wardrobe, { weather: { tempC: 5 }, seed: 1 });
    expect(
      outs[0].items.some((e) =>
        (e.item?.category || "").toLowerCase().includes("outer"),
      ),
    ).toBe(true);
  });

  test("drops outerwear on hot days", async () => {
    const outs = await generateOutfits(wardrobe, { weather: { tempC: 30 }, seed: 1 });
    expect(
      outs[0].items.some((e) =>
        (e.item?.category || "").toLowerCase().includes("outer"),
      ),
    ).toBe(false);
  });

  test("is deterministic for the same input + seed", async () => {
    const [a] = await generateOutfits(wardrobe, { seed: 99 });
    const [b] = await generateOutfits(wardrobe, { seed: 99 });
    expect(a.items.map((e) => e.id)).toEqual(b.items.map((e) => e.id));
  });

  test("returns empty for an empty pool", async () => {
    const outs = await generateOutfits([], {});
    expect(outs.length).toBe(0);
  });
});