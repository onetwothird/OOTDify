import { liveOutfit } from "../liveGarmentStore";

const items = [
  { id: "top", image_url: "top.jpg", category: "Tops", name: "White tee" },
  { id: "hat", image_url: "hat.jpg", category: "Accessories", name: "Bucket hat", tags: [] },
  { id: "noimg", image_url: null, category: "Bottoms", name: "Jeans" },
  { id: "ring", image_url: "ring.jpg", category: "Accessories", name: "Gold ring" },
  { id: "anon", image_url: "anon.jpg", category: "Bottoms", name: null },
];

describe("liveOutfit", () => {
  it("keeps the selected items with images, in selection order, with kinds", () => {
    expect(liveOutfit(["hat", "top"], items, "Item")).toEqual([
      { id: "hat", imageRef: "hat.jpg", category: "Accessories", name: "Bucket hat", kind: "hat" },
      { id: "top", imageRef: "top.jpg", category: "Tops", name: "White tee", kind: "upper" },
    ]);
  });

  it("skips ids not in the list and items without an image", () => {
    expect(liveOutfit(new Set(["zzz", "noimg", "top"]), items, "Item")?.map((g) => g.id)).toEqual(["top"]);
  });

  it("is null when nothing selected can be placed", () => {
    expect(liveOutfit(["ring"], items, "Item")).toBeNull();
    expect(liveOutfit([], items, "Item")).toBeNull();
  });

  it("keeps an unplaceable item alongside placeable ones", () => {
    expect(liveOutfit(["top", "ring"], items, "Item")?.map((g) => [g.id, g.kind])).toEqual([
      ["top", "upper"],
      ["ring", null],
    ]);
  });

  it("uses the fallback name for an unnamed item", () => {
    expect(liveOutfit(["anon"], items, "Item")?.[0].name).toBe("Item");
  });
});
