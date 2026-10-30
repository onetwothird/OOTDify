import { discoverPieces, friendState, savedLookFor, type PublicPiece } from "../pieces";

function piece(id: string, over: Partial<PublicPiece> = {}): PublicPiece {
  return {
    id,
    user_id: "u1",
    name: id,
    category: "top",
    image_url: `wardrobe/${id}.jpg`,
    is_public: true,
    like_count: 0,
    comment_count: 0,
    created_at: "2026-10-30T10:00:00Z",
    ...over,
  };
}

describe("discoverPieces", () => {
  it("shows other people's public pieces with a photo, newest first", () => {
    const items = [
      piece("old", { created_at: "2026-10-29T10:00:00Z" }),
      piece("new", { created_at: "2026-10-30T11:00:00Z" }),
      piece("mine", { user_id: "me" }),
      piece("private", { is_public: false }),
      piece("no-photo", { image_url: null }),
    ];
    expect(discoverPieces(items, "me").map((p) => p.id)).toEqual(["new", "old"]);
  });

  it("shows strangers' pieces, not only friends'", () => {
    expect(discoverPieces([piece("a", { user_id: "stranger" })], "me")).toHaveLength(1);
  });
});

describe("friendState", () => {
  const overview = { me: "me", friends: ["f"], incoming: ["in"], outgoing: ["out"] };
  it("tells which button a creator gets", () => {
    expect(friendState("me", overview)).toBe("self");
    expect(friendState("f", overview)).toBe("friend");
    expect(friendState("in", overview)).toBe("incoming");
    expect(friendState("out", overview)).toBe("outgoing");
    expect(friendState("x", overview)).toBe("none");
  });

  it("offers nothing while friends haven't loaded", () => {
    expect(friendState("x", null)).toBe("unknown");
  });
});

describe("savedLookFor", () => {
  it("finds the look I saved from a post", () => {
    const outfits = [
      { id: "o1", source_post_id: null },
      { id: "o2", source_post_id: "p1" },
    ];
    expect(savedLookFor(outfits, "p1")?.id).toBe("o2");
    expect(savedLookFor(outfits, "p2")).toBeUndefined();
  });
});
