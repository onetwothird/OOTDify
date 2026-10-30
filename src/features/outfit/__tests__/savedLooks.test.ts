import { lookThumbnails, savedLookTarget } from "../savedLooks";

const mine = { id: "o1", clothing_ids: ["a", "b"], result_url: null, source_post_id: null, source_user_id: null };
const fromSomeone = { id: "o2", clothing_ids: [], result_url: "community/p1.jpg", source_post_id: "p1", source_user_id: "u2" };
const pieces = { a: { image_url: "wardrobe/a.jpg" }, b: { image_url: null } };

describe("lookThumbnails", () => {
  it("uses my own pieces' photos", () => {
    expect(lookThumbnails(mine, pieces)).toEqual(["wardrobe/a.jpg"]);
  });

  it("uses the post photo for a look saved from someone", () => {
    expect(lookThumbnails(fromSomeone, pieces)).toEqual(["community/p1.jpg"]);
  });
});

describe("savedLookTarget", () => {
  it("opens my look's own page", () => {
    expect(savedLookTarget(mine)).toEqual({ kind: "outfit", id: "o1" });
  });

  it("opens the original post for a look saved from someone", () => {
    expect(savedLookTarget(fromSomeone)).toEqual({ kind: "post", id: "p1" });
  });
});
