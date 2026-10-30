import { NOTE_FRESH_MS, penggiLines, type PenggiContext } from "../penggiLines";

const NOW = Date.parse("2026-10-31T09:00:00Z");
const base: PenggiContext = { pieceCount: 12, lookCount: 3, note: null, friendLooks: [], now: NOW, hour: 9 };
const keys = (lines: { key: string }[]) => lines.map((l) => l.key);

describe("penggiLines", () => {
  it("says hello first when there is no news", () => {
    const { news, intro } = penggiLines(base);
    expect(news).toEqual([]);
    expect(intro?.key).toBe("home.penggi.welcome");
  });

  it("talks about the real closet and looks, not made-up praise", () => {
    expect(keys(penggiLines({ ...base, pieceCount: 0 }).loop)).toContain("home.penggi.closet_empty");
    const few = penggiLines({ ...base, pieceCount: 3 }).loop.find((l) => l.key === "home.penggi.closet_few");
    expect(few?.params).toEqual({ count: 3 });
    expect(keys(penggiLines(base).loop)).toContain("home.penggi.closet_many");
    expect(keys(penggiLines({ ...base, lookCount: 0 }).loop)).toContain("home.penggi.looks_none");
    expect(keys(penggiLines({ ...base, pieceCount: 0 }).loop)).not.toContain("home.penggi.closet_many");
  });

  it("matches the time of day", () => {
    expect(keys(penggiLines({ ...base, hour: 8 }).loop)).toContain("home.penggi.morning");
    expect(keys(penggiLines({ ...base, hour: 14 }).loop)).toContain("home.penggi.afternoon");
    expect(keys(penggiLines({ ...base, hour: 21 }).loop)).toContain("home.penggi.evening");
  });

  it("leads with what I just changed, and skips the hello", () => {
    const note = { id: 1, kind: "appearance" as const, value: "dark", at: NOW - 60_000 };
    const { news, intro } = penggiLines({ ...base, note });
    expect(news[0].key).toBe("home.penggi.note.appearance.dark");
    expect(intro).toBeNull();
  });

  it("names the piece I just added", () => {
    const note = { id: 2, kind: "piece_added" as const, value: "Denim jacket", at: NOW - 1000 };
    expect(penggiLines({ ...base, note }).news[0]).toMatchObject({
      key: "home.penggi.note.piece_added",
      params: { name: "Denim jacket" },
    });
  });

  it("forgets a change once it is old", () => {
    const note = { id: 3, kind: "text_size" as const, value: "large", at: NOW - NOTE_FRESH_MS - 1 };
    expect(penggiLines({ ...base, note }).news).toEqual([]);
  });

  it("announces friends' new looks with the friend's name to highlight", () => {
    const friendLooks = [
      { postId: "p1", userId: "u1", name: "Mika", at: "2026-10-31T08:00:00Z" },
      { postId: "p2", userId: "u2", name: "Jo", at: "2026-10-30T20:00:00Z" },
    ];
    const { news } = penggiLines({ ...base, friendLooks });
    expect(news.map((l) => [l.key, l.highlight, l.route])).toEqual([
      ["home.penggi.friend_look", "Mika", "discover"],
      ["home.penggi.friend_look", "Jo", "discover"],
    ]);
    expect(news[0].params).toEqual({ name: "Mika" });
  });

  it("gives every line a stable id, so news restarts the bubble only when it changes", () => {
    const a = penggiLines(base).loop.map((l) => l.id);
    expect(new Set(a).size).toBe(a.length);
    expect(penggiLines(base).loop.map((l) => l.id)).toEqual(a);
  });
});
