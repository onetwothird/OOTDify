import { wardrobeSection } from "../section";

describe("wardrobeSection", () => {
  it("opens Outfits only when asked", () => {
    expect(wardrobeSection("outfits")).toBe("outfits");
    expect(wardrobeSection("closet")).toBe("closet");
    expect(wardrobeSection(undefined)).toBe("closet");
    expect(wardrobeSection(["outfits", "closet"])).toBe("outfits");
    expect(wardrobeSection("calendar")).toBe("closet");
  });
});
