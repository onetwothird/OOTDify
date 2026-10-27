import { OutfitPiece, orderPieces, pieceHref } from "../pieces";

const piece = (id: string, source: OutfitPiece["source"]): OutfitPiece => ({
  id,
  name: id,
  category: "Tops",
  image_url: `${id}.jpg`,
  source,
});

describe("orderPieces", () => {
  it("keeps the saved order across closet and catalog pieces", () => {
    const out = orderPieces(["c2", "k1", "c1"], [piece("c1", "closet"), piece("c2", "closet")], [piece("k1", "catalog")]);
    expect(out.map((p) => p.id)).toEqual(["c2", "k1", "c1"]);
    expect(out.map((p) => p.source)).toEqual(["closet", "catalog", "closet"]);
  });

  it("prefers the closet when an id is in both", () => {
    expect(orderPieces(["x"], [piece("x", "closet")], [piece("x", "catalog")])[0].source).toBe("closet");
  });

  it("drops ids that no longer exist", () => {
    expect(orderPieces(["gone", "c1"], [piece("c1", "closet")], []).map((p) => p.id)).toEqual(["c1"]);
  });

  it("returns nothing for no ids", () => {
    expect(orderPieces([], [piece("c1", "closet")], [])).toEqual([]);
  });
});

describe("pieceHref", () => {
  it("opens closet pieces on the item page", () => {
    expect(pieceHref({ id: "c1", source: "closet" })).toBe("/item/c1");
  });

  it("opens legacy catalog pieces on the product page", () => {
    expect(pieceHref({ id: "k1", source: "catalog" })).toBe("/catalog/k1");
  });
});
