import { mixHex } from "../mixHex";

describe("mixHex", () => {
  it("returns the first colour at 0 and the second at 1", () => {
    expect(mixHex("#3A5A96", "#FFFFFF", 0)).toBe("#3A5A96");
    expect(mixHex("#3A5A96", "#FFFFFF", 1)).toBe("#FFFFFF");
  });

  it("blends each channel and rounds to a 6-digit hex", () => {
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixHex("#FF0000", "#0000FF", 0.25)).toBe("#BF0040");
  });

  it("clamps the amount", () => {
    expect(mixHex("#000000", "#FFFFFF", -1)).toBe("#000000");
    expect(mixHex("#000000", "#FFFFFF", 2)).toBe("#FFFFFF");
  });
});
