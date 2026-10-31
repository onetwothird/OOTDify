import {
  DOUBLE_TAP_MS,
  SHARED_POST_BODY,
  isDoubleTap,
  needsSeeMore,
  postMenuActions,
  reshareTarget,
  sharedPostBody,
  shareOutText,
  visiblePosts,
} from "../postShare";

describe("postMenuActions", () => {
  it("offers someone else's post save, send, share out, hide and their profile", () => {
    expect(postMenuActions({ isOwn: false, saved: false })).toEqual([
      "save",
      "send",
      "share_out",
      "view_profile",
      "hide",
    ]);
  });

  it("offers my own post unsave, send, share out and delete, never hide", () => {
    expect(postMenuActions({ isOwn: true, saved: true })).toEqual(["unsave", "send", "share_out", "delete"]);
  });
});

describe("reshareTarget", () => {
  it("reshares the original, even from a reshare", () => {
    expect(reshareTarget({ id: "p1", reshared_from: null })).toBe("p1");
    expect(reshareTarget({ id: "r1", reshared_from: "p1" })).toBe("p1");
  });
});

describe("needsSeeMore", () => {
  it("folds long captions and captions with many lines", () => {
    expect(needsSeeMore("short and sweet")).toBe(false);
    expect(needsSeeMore("x".repeat(181))).toBe(true);
    expect(needsSeeMore("a\nb\nc\nd\ne")).toBe(true);
    expect(needsSeeMore(null)).toBe(false);
  });
});

describe("isDoubleTap", () => {
  it("is a second tap inside the window", () => {
    expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS)).toBe(true);
    expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS + 1)).toBe(false);
    expect(isDoubleTap(null, 1000)).toBe(false);
  });
});

describe("sharedPostBody", () => {
  it("uses the note, or a short label so previews never read empty", () => {
    expect(sharedPostBody("  look at this  ")).toBe("look at this");
    expect(sharedPostBody("   ")).toBe(SHARED_POST_BODY);
  });
});

describe("shareOutText", () => {
  it("names the post and its author and adds the photo link", () => {
    expect(shareOutText({ title: "Sunday fit", caption: "linen all day" }, "Ana", "https://x/y.jpg")).toBe(
      "Sunday fit by Ana on Penggi\nlinen all day\nhttps://x/y.jpg",
    );
    expect(shareOutText({ title: null, caption: null }, "Ana", null)).toBe("A look by Ana on Penggi");
  });
});

describe("visiblePosts", () => {
  it("drops posts I hid", () => {
    const posts = [{ id: "a" }, { id: "b" }];
    expect(visiblePosts(posts, new Set(["b"])).map((p) => p.id)).toEqual(["a"]);
  });
});
