import type { ClothingItem } from "../../clothing/types";
import { filterCloset } from "../filter";

const item = (id: string, over: Partial<ClothingItem>): ClothingItem => ({
  id,
  user_id: "u1",
  clothing_id: null,
  name: null,
  category: null,
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
  created_at: "2026-10-27T00:00:00Z",
  ...over,
});

const ITEMS = [
  item("1", { name: "Linen overshirt", category: "Tops", color: "Beige", brand: "Uniqlo" }),
  item("2", { name: "Wide jeans", category: "Bottoms", color: "Blue" }),
  item("3", { name: null, category: "Shoes", color: "White", brand: "Nike" }),
];

const ids = (list: ClothingItem[]) => list.map((i) => i.id);

describe("filterCloset", () => {
  it("returns everything for an empty query and no category", () => {
    expect(ids(filterCloset(ITEMS, "", null))).toEqual(["1", "2", "3"]);
  });

  it("treats a whitespace query as no filter", () => {
    expect(ids(filterCloset(ITEMS, "   ", null))).toEqual(["1", "2", "3"]);
  });

  it.each([
    ["linen", ["1"]],
    ["NIKE", ["3"]],
    ["blue", ["2"]],
    ["shoes", ["3"]],
  ])("matches %p on name, brand, colour or category", (query, expected) => {
    expect(ids(filterCloset(ITEMS, query, null))).toEqual(expected);
  });

  it("also matches size, style, season, tags and occasions", () => {
    const extra = [item("4", { size: "XL", style: "Streetwear", season: "Winter", tags: ["thrifted"], occasion: ["Gym"] })];
    for (const q of ["xl", "street", "winter", "thrift", "gym"]) {
      expect(ids(filterCloset(extra, q, null))).toEqual(["4"]);
    }
  });

  it("filters by category", () => {
    expect(ids(filterCloset(ITEMS, "", "Bottoms"))).toEqual(["2"]);
  });

  it("combines query and category", () => {
    expect(ids(filterCloset(ITEMS, "white", "Tops"))).toEqual([]);
    expect(ids(filterCloset(ITEMS, "white", "Shoes"))).toEqual(["3"]);
  });

  it("returns nothing for an empty closet", () => {
    expect(filterCloset([], "tops", "Tops")).toEqual([]);
  });
});
