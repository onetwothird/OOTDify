import { hotScore, lookOfTheWeek, sortLooks, splitColumns, topCreators, type Look } from "../rank";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const HOUR = 3_600_000;

function look(id: string, over: Partial<Look> = {}): Look {
  return {
    id,
    user_id: "u1",
    image_urls: ["a.jpg"],
    like_count: 0,
    comment_count: 0,
    created_at: new Date(NOW - HOUR).toISOString(),
    ...over,
  };
}
const ago = (hours: number) => new Date(NOW - hours * HOUR).toISOString();

describe("hotScore", () => {
  it("rises with likes and comments and falls with age", () => {
    const base = hotScore(look("a", { created_at: ago(1) }), NOW);
    expect(hotScore(look("a", { created_at: ago(1), like_count: 5 }), NOW)).toBeGreaterThan(base);
    expect(hotScore(look("a", { created_at: ago(1), comment_count: 1 }), NOW)).toBeCloseTo(
      hotScore(look("a", { created_at: ago(1), like_count: 2 }), NOW),
    );
    expect(hotScore(look("a", { created_at: ago(48) }), NOW)).toBeLessThan(base);
  });

  it("matches the spec formula", () => {
    expect(hotScore(look("a", { like_count: 3, comment_count: 1, created_at: ago(2) }), NOW)).toBeCloseTo(
      (3 + 2 + 1) / Math.pow(4, 1.5),
    );
  });
});

describe("sortLooks", () => {
  const posts = [
    look("old-hot", { like_count: 40, created_at: ago(10) }),
    look("new", { created_at: ago(0.5) }),
    look("friend", { user_id: "f1", created_at: ago(5) }),
    look("text-only", { image_urls: [], like_count: 99 }),
  ];

  it("drops posts without images", () => {
    expect(sortLooks(posts, "new", NOW, new Set()).map((p) => p.id)).not.toContain("text-only");
  });

  it("new is newest first", () => {
    expect(sortLooks(posts, "new", NOW, new Set()).map((p) => p.id)).toEqual(["new", "friend", "old-hot"]);
  });

  it("trending orders by hot score", () => {
    expect(sortLooks(posts, "trending", NOW, new Set())[0].id).toBe("old-hot");
  });

  it("friends keeps only friends' looks, newest first", () => {
    expect(sortLooks(posts, "friends", NOW, new Set(["f1"])).map((p) => p.id)).toEqual(["friend"]);
  });
});

describe("lookOfTheWeek", () => {
  it("is the most-liked look with images from the last 7 days", () => {
    const posts = [
      look("a", { like_count: 3, created_at: ago(24) }),
      look("b", { like_count: 2, comment_count: 2, created_at: ago(48) }),
      look("too-old", { like_count: 100, created_at: ago(8 * 24) }),
      look("no-image", { like_count: 50, image_urls: [] }),
    ];
    expect(lookOfTheWeek(posts, NOW)?.id).toBe("b");
  });

  it("is null without a liked or commented look this week", () => {
    expect(lookOfTheWeek([look("a")], NOW)).toBeNull();
    expect(lookOfTheWeek([], NOW)).toBeNull();
  });
});

describe("topCreators", () => {
  it("ranks authors by likes received in the last 30 days", () => {
    const posts = [
      look("1", { user_id: "ana", like_count: 5 }),
      look("2", { user_id: "ana", like_count: 4 }),
      look("3", { user_id: "ben", like_count: 7 }),
      look("4", { user_id: "cy", like_count: 50, created_at: ago(31 * 24) }),
      look("5", { user_id: "dee", like_count: 0 }),
    ];
    expect(topCreators(posts, NOW, 8)).toEqual([
      { userId: "ana", likes: 9, looks: 2 },
      { userId: "ben", likes: 7, looks: 1 },
    ]);
    expect(topCreators(posts, NOW, 1)).toHaveLength(1);
  });
});

describe("splitColumns", () => {
  it("fills the shorter column first", () => {
    const single = (id: string) => look(id, { image_urls: ["x"] }); // 4:5 → height 1.25
    const multi = (id: string) => look(id, { image_urls: ["x", "y"] }); // 1:1 → height 1
    const [left, right] = splitColumns([single("a"), multi("b"), multi("c"), single("d")]);
    expect(left.map((p) => p.id)).toEqual(["a", "d"]);
    expect(right.map((p) => p.id)).toEqual(["b", "c"]);
  });
});
