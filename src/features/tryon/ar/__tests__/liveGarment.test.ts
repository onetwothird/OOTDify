import { liveGarmentCandidate } from "../liveGarmentStore";

const items = [
  { id: "a", image_url: "a.jpg" },
  { id: "b", image_url: null },
];

describe("liveGarmentCandidate", () => {
  it("returns the one selected item in the current list", () => {
    expect(liveGarmentCandidate(new Set(["a"]), items)).toEqual(items[0]);
  });

  it("is null when the selection belongs to another list", () => {
    expect(liveGarmentCandidate(new Set(["z"]), items)).toBeNull();
  });

  it("is null for zero or several selected items", () => {
    expect(liveGarmentCandidate(new Set(), items)).toBeNull();
    expect(liveGarmentCandidate(new Set(["a", "b"]), items)).toBeNull();
  });

  it("is null when the item has no image to overlay", () => {
    expect(liveGarmentCandidate(new Set(["b"]), items)).toBeNull();
  });
});
