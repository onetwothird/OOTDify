import {
  CHAT_THEMES,
  MUTE_FOREVER_ISO,
  canChangeTheme,
  chatTheme,
  contrastRatio,
  isMuted,
  memberActions,
  memberRole,
  muteState,
  muteUntil,
  sortMembers,
  themeGrid,
} from "../chatSettings";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const HOUR = 3_600_000;

describe("mute", () => {
  it("computes when a mute ends", () => {
    expect(muteUntil("1h", NOW)).toBe(new Date(NOW + HOUR).toISOString());
    expect(muteUntil("8h", NOW)).toBe(new Date(NOW + 8 * HOUR).toISOString());
    expect(muteUntil("24h", NOW)).toBe(new Date(NOW + 24 * HOUR).toISOString());
    expect(muteUntil("forever", NOW)).toBe(MUTE_FOREVER_ISO);
  });

  it("is muted only while the end is in the future", () => {
    expect(isMuted(null, NOW)).toBe(false);
    expect(isMuted(new Date(NOW - 1).toISOString(), NOW)).toBe(false);
    expect(isMuted(new Date(NOW + 1).toISOString(), NOW)).toBe(true);
    expect(isMuted("not a date", NOW)).toBe(false);
  });

  it("tells a timed mute from an open-ended one", () => {
    expect(muteState(null, NOW)).toEqual({ kind: "off" });
    expect(muteState(MUTE_FOREVER_ISO, NOW)).toEqual({ kind: "forever" });
    const at = new Date(NOW + HOUR).toISOString();
    expect(muteState(at, NOW)).toEqual({ kind: "until", at });
  });
});

describe("chat themes", () => {
  it("ships fourteen full themes with unique keys and hex colours", () => {
    expect(CHAT_THEMES).toHaveLength(14);
    expect(new Set(CHAT_THEMES.map((t) => t.key)).size).toBe(14);
    for (const t of CHAT_THEMES) {
      expect(t.key).toMatch(/^[a-z]{1,20}$/);
      for (const colour of [t.background, t.mine, t.onMine, t.theirs, t.onTheirs, t.accent, t.onAccent, t.muted]) {
        expect(colour).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });

  it("keeps the keys stored before full themes existed", () => {
    for (const key of ["denim", "copper", "olive", "plum", "teal", "rose", "charcoal", "butter"]) {
      expect(chatTheme(key)?.key).toBe(key);
    }
  });

  it("offers dark themes as well as light ones", () => {
    expect(CHAT_THEMES.filter((t) => t.dark).length).toBeGreaterThanOrEqual(3);
  });

  it("keeps every text colour readable on what it sits on (WCAG 4.5:1)", () => {
    for (const t of CHAT_THEMES) {
      expect([t.key, contrastRatio(t.onMine, t.mine) >= 4.5]).toEqual([t.key, true]);
      expect([t.key, contrastRatio(t.onTheirs, t.theirs) >= 4.5]).toEqual([t.key, true]);
      expect([t.key, contrastRatio(t.onAccent, t.accent) >= 4.5]).toEqual([t.key, true]);
      expect([t.key, contrastRatio(t.muted, t.background) >= 4.5]).toEqual([t.key, true]);
      // The header, composer and input reuse the theirs pair, and typed text sits on the background.
      expect([t.key, contrastRatio(t.onTheirs, t.background) >= 4.5]).toEqual([t.key, true]);
      // The send button and accents must stand out from the chat background.
      expect([t.key, contrastRatio(t.accent, t.background) >= 3]).toEqual([t.key, true]);
    }
  });

  it("measures contrast like WCAG", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1);
  });

  it("resolves a stored key, or null for the default", () => {
    expect(chatTheme(CHAT_THEMES[0].key)).toBe(CHAT_THEMES[0]);
    expect(chatTheme(null)).toBeNull();
    expect(chatTheme("nope")).toBeNull();
  });

  it("lets anyone in a DM change it but only admins in a community", () => {
    expect(canChangeTheme(false, "member")).toBe(true);
    expect(canChangeTheme(true, "member")).toBe(false);
    expect(canChangeTheme(true, "admin")).toBe(true);
    expect(canChangeTheme(true, "creator")).toBe(true);
  });
});

describe("members", () => {
  const admins = new Set(["adm"]);

  it("assigns roles", () => {
    expect(memberRole("own", "own", admins)).toBe("creator");
    expect(memberRole("adm", "own", admins)).toBe("admin");
    expect(memberRole("x", "own", admins)).toBe("member");
  });

  it("gives the creator full control and admins removal of members only", () => {
    expect(memberActions("creator", "member", false)).toEqual(["make_admin", "remove"]);
    expect(memberActions("creator", "admin", false)).toEqual(["remove_admin", "remove"]);
    expect(memberActions("admin", "member", false)).toEqual(["remove"]);
    expect(memberActions("admin", "admin", false)).toEqual([]);
    expect(memberActions("admin", "creator", false)).toEqual([]);
    expect(memberActions("member", "member", false)).toEqual([]);
    expect(memberActions("creator", "creator", true)).toEqual([]);
  });

  it("lists the creator, then admins, then everyone else by name", () => {
    const sorted = sortMembers([
      { userId: "b", name: "Bea", role: "member" as const },
      { userId: "a", name: "aldo", role: "member" as const },
      { userId: "adm", name: "Zed", role: "admin" as const },
      { userId: "own", name: "Cy", role: "creator" as const },
    ]);
    expect(sorted.map((m) => m.userId)).toEqual(["own", "adm", "a", "b"]);
  });
});

describe("themeGrid", () => {
  it("fits tiles of at least 72 wide and fills the row exactly", () => {
    for (const width of [240, 280, 311, 343, 390, 600, 900]) {
      const { columns, size } = themeGrid(width, 10);
      expect(size).toBeGreaterThanOrEqual(72);
      expect(columns * size + (columns - 1) * 10).toBeLessThanOrEqual(width);
      expect(columns * size + (columns - 1) * 10).toBeGreaterThan(width - columns);
    }
  });

  it("uses more columns on wider screens, capped at six", () => {
    expect(themeGrid(280, 10).columns).toBe(3);
    expect(themeGrid(343, 10).columns).toBe(4);
    expect(themeGrid(2000, 10).columns).toBe(6);
  });

  it("still shows at least two columns before the layout is measured", () => {
    expect(themeGrid(0, 10).columns).toBe(2);
    expect(themeGrid(0, 10).size).toBe(0);
  });
});
