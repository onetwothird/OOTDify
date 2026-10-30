import { wardrobeObjectPath } from "../wardrobePath";

describe("wardrobeObjectPath", () => {
  it("turns a wardrobe ref into its storage path", () => {
    expect(wardrobeObjectPath("wardrobe/u1/item-1.jpg")).toBe("u1/item-1.jpg");
  });

  it("leaves other photos alone", () => {
    expect(wardrobeObjectPath("community/u1/a.jpg")).toBeNull();
    expect(wardrobeObjectPath("https://res.cloudinary.com/x.jpg")).toBeNull();
    expect(wardrobeObjectPath(null)).toBeNull();
    expect(wardrobeObjectPath("wardrobe/")).toBeNull();
  });
});
