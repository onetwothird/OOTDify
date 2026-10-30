import {
  CHAT_THEMES,
  MUTE_FOREVER_ISO,
  canChangeTheme,
  chatTheme,
  isMuted,
  memberActions,
  memberRole,
  muteState,
  muteUntil,
  sortMembers,
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
  it("ships eight presets with hex colours and unique keys", () => {
    expect(CHAT_THEMES).toHaveLength(8);
    expect(new Set(CHAT_THEMES.map((t) => t.key)).size).toBe(8);
    for (const t of CHAT_THEMES) {
      expect(t.key).toMatch(/^[a-z]{1,20}$/);
      expect(t.bubble).toMatch(/^#[0-9A-F]{6}$/);
      expect(t.onBubble).toMatch(/^#[0-9A-F]{6}$/);
    }
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
