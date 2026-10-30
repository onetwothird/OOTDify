import { appendPage, morePieces, pageOf, showMore } from "../paging";

describe("pageOf", () => {
  it("asks for one extra row to know whether another page exists", () => {
    expect(pageOf([1, 2, 3], 2)).toEqual({ items: [1, 2], hasMore: true });
    expect(pageOf([1, 2], 2)).toEqual({ items: [1, 2], hasMore: false });
  });
});

describe("appendPage", () => {
  it("adds the next page without repeating rows that moved between pages", () => {
    expect(appendPage([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("morePieces", () => {
  it("starts the next page after the rows already shown", () => {
    expect(morePieces(0, 24)).toEqual({ from: 0, to: 24 });
    expect(morePieces(24, 24)).toEqual({ from: 24, to: 48 });
  });
});

describe("showMore", () => {
  it("reveals the next page of looks, never past the end", () => {
    expect(showMore(20, 55, 20)).toBe(40);
    expect(showMore(40, 55, 20)).toBe(55);
    expect(showMore(55, 55, 20)).toBe(55);
  });
});
