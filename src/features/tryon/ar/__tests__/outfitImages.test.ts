import { urisToLoad } from "../outfitImages";

describe("urisToLoad", () => {
  it("loads only uris not already loaded or loading", () => {
    expect(urisToLoad(["a", "b", "c"], new Set(["a"]))).toEqual(["b", "c"]);
    expect(urisToLoad(["a", "b"], new Set(["a", "b"]))).toEqual([]);
  });

  it("loads each uri once even when listed twice", () => {
    expect(urisToLoad(["a", "a", "b"], new Set())).toEqual(["a", "b"]);
  });
});
