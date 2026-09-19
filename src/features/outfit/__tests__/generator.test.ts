import { generateOutfits } from "../generator";

describe("generateOutfits", () => {
  const wardrobe = [
    { id: "a", name: "A", category: "Tops", images: [] },
    { id: "b", name: "B", category: "Bottoms", images: [] },
    { id: "c", name: "C", category: "Outerwear", images: [] },
  ] as any;

  test("returns at least one outfit", async () => {
    const outs = await generateOutfits(wardrobe, {});
    expect(outs.length).toBeGreaterThan(0);
    expect(outs[0].items.length).toBeGreaterThan(0);
  });

  test("considers temperature when cold", async () => {
    const outs = await generateOutfits(wardrobe, { weather: { tempC: 5 } });
    expect(
      outs[0].items.some((i: any) =>
        (i.category || "").toLowerCase().includes("outer"),
      ),
    ).toBe(true);
  });
});
