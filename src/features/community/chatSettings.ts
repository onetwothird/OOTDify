// C:\OOTDify\src\features\community\chatSettings.ts
// Pure rules behind a conversation's settings screen: mute times, the shared
// chat theme presets and who may manage members. The database enforces the
// same permissions (migration 20261030120000_chat_actions.sql).

export type MuteOption = "1h" | "8h" | "24h" | "forever";

/** Stored for "until I turn it back on": far enough away to never pass. */
export const MUTE_FOREVER_ISO = "9999-12-31T23:59:59.000Z";

const HOUR_MS = 3_600_000;
const MUTE_HOURS: Record<Exclude<MuteOption, "forever">, number> = { "1h": 1, "8h": 8, "24h": 24 };

export function muteUntil(option: MuteOption, now: number): string {
  return option === "forever" ? MUTE_FOREVER_ISO : new Date(now + MUTE_HOURS[option] * HOUR_MS).toISOString();
}

export function isMuted(mutedUntil: string | null, now: number): boolean {
  if (!mutedUntil) return false;
  const end = Date.parse(mutedUntil);
  return !Number.isNaN(end) && end > now;
}

export type MuteState = { kind: "off" } | { kind: "forever" } | { kind: "until"; at: string };

export function muteState(mutedUntil: string | null, now: number): MuteState {
  if (!isMuted(mutedUntil, now)) return { kind: "off" };
  if (Date.parse(mutedUntil as string) >= Date.parse(MUTE_FOREVER_ISO)) return { kind: "forever" };
  return { kind: "until", at: mutedUntil as string };
}

/** A chat theme: the sender's bubble colour and the text drawn on it. */
/**
 * A whole-chat theme: the thread's background, both sides' bubbles, the
 * accent (send button, reply bars, your reaction) and the muted text drawn
 * straight on the background (names, day separators, "unsent" marks).
 */
export interface ChatTheme {
  key: string;
  /** True when the background is dark, so the screen can pick matching chrome. */
  dark: boolean;
  background: string;
  mine: string;
  onMine: string;
  theirs: string;
  onTheirs: string;
  accent: string;
  onAccent: string;
  muted: string;
}

/**
 * The themes a conversation can use (conversations.chat_theme). The default
 * (null) keeps the app theme's own colours. Every text colour passes 4.5:1 on
 * what it sits on (chatSettings.test.ts checks this). The first eight keys
 * predate full themes and must stay.
 */
export const CHAT_THEMES: readonly ChatTheme[] = [
  { key: "denim", dark: false, background: "#E6ECF5", mine: "#2F4A7A", onMine: "#FFFFFF", theirs: "#FFFFFF", onTheirs: "#1B2433", accent: "#2F4A7A", onAccent: "#FFFFFF", muted: "#4A586E" },
  { key: "copper", dark: false, background: "#F6EBE2", mine: "#9A4E1E", onMine: "#FFFFFF", theirs: "#FFFFFF", onTheirs: "#2E1D12", accent: "#9A4E1E", onAccent: "#FFFFFF", muted: "#6E5140" },
  { key: "olive", dark: false, background: "#ECEEDF", mine: "#4F5D2F", onMine: "#FFFFFF", theirs: "#FFFFFF", onTheirs: "#23281A", accent: "#4F5D2F", onAccent: "#FFFFFF", muted: "#565E42" },
  { key: "plum", dark: false, background: "#F2E6EF", mine: "#6B2D5C", onMine: "#FFFFFF", theirs: "#FFFFFF", onTheirs: "#2B1426", accent: "#6B2D5C", onAccent: "#FFFFFF", muted: "#6A4D61" },
  { key: "teal", dark: false, background: "#E1F0EF", mine: "#0F6466", onMine: "#FFFFFF", theirs: "#FFFFFF", onTheirs: "#0F2A2B", accent: "#0F6466", onAccent: "#FFFFFF", muted: "#43615F" },
  { key: "rose", dark: false, background: "#FBE8ED", mine: "#B03A5B", onMine: "#FFFFFF", theirs: "#FFFFFF", onTheirs: "#3A1520", accent: "#B03A5B", onAccent: "#FFFFFF", muted: "#77505A" },
  { key: "charcoal", dark: true, background: "#1C1E22", mine: "#E9E6DF", onMine: "#1C1E22", theirs: "#2E3137", onTheirs: "#F2F2F2", accent: "#E9E6DF", onAccent: "#1C1E22", muted: "#A3A8B0" },
  { key: "butter", dark: false, background: "#FBF4DF", mine: "#F2D27A", onMine: "#2B2410", theirs: "#FFFFFF", onTheirs: "#2B2410", accent: "#7A5C0E", onAccent: "#FFFFFF", muted: "#6B5C34" },
  { key: "midnight", dark: true, background: "#0E1630", mine: "#3D5BD9", onMine: "#FFFFFF", theirs: "#1E2747", onTheirs: "#E8ECFF", accent: "#8FA6FF", onAccent: "#0E1630", muted: "#9AA6CC" },
  { key: "forest", dark: true, background: "#12201A", mine: "#2F7A55", onMine: "#FFFFFF", theirs: "#1F3329", onTheirs: "#E6F2EA", accent: "#7CC9A0", onAccent: "#12201A", muted: "#8FB3A0" },
  { key: "sakura", dark: false, background: "#FFF0F5", mine: "#C2185B", onMine: "#FFFFFF", theirs: "#FFFFFF", onTheirs: "#3B0D1F", accent: "#C2185B", onAccent: "#FFFFFF", muted: "#835466" },
  { key: "runway", dark: false, background: "#FFFFFF", mine: "#000000", onMine: "#FFFFFF", theirs: "#EFEFEF", onTheirs: "#000000", accent: "#000000", onAccent: "#FFFFFF", muted: "#5C5C5C" },
  { key: "sunset", dark: false, background: "#FFF0E4", mine: "#B83A0B", onMine: "#FFFFFF", theirs: "#FFFFFF", onTheirs: "#3A1A0A", accent: "#B83A0B", onAccent: "#FFFFFF", muted: "#7E5747" },
  { key: "lavender", dark: false, background: "#EFECFA", mine: "#5B4BB7", onMine: "#FFFFFF", theirs: "#FFFFFF", onTheirs: "#221B45", accent: "#5B4BB7", onAccent: "#FFFFFF", muted: "#5F5985" },
];

/** WCAG contrast ratio between two 6-digit hex colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function chatTheme(key: string | null | undefined): ChatTheme | null {
  return CHAT_THEMES.find((t) => t.key === key) ?? null;
}

export type MemberRole = "creator" | "admin" | "member";
export type MemberAction = "make_admin" | "remove_admin" | "remove";

export function memberRole(userId: string, createdBy: string | null, adminIds: ReadonlySet<string>): MemberRole {
  if (userId === createdBy) return "creator";
  return adminIds.has(userId) ? "admin" : "member";
}

/** In a DM either person may change the theme; in a community only admins. */
export function canChangeTheme(isCommunity: boolean, viewer: MemberRole): boolean {
  return !isCommunity || viewer !== "member";
}

/** What the viewer may do to another member. The creator can't be removed. */
export function memberActions(viewer: MemberRole, target: MemberRole, isSelf: boolean): MemberAction[] {
  if (isSelf || target === "creator") return [];
  if (viewer === "creator") return target === "admin" ? ["remove_admin", "remove"] : ["make_admin", "remove"];
  if (viewer === "admin" && target === "member") return ["remove"];
  return [];
}

const ROLE_ORDER: Record<MemberRole, number> = { creator: 0, admin: 1, member: 2 };

export function sortMembers<T extends { name: string; role: MemberRole }>(members: T[]): T[] {
  return [...members].sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

const THEME_TILE_MIN = 72;
const THEME_COLUMNS_MAX = 6;

/**
 * The theme preview grid for a measured width: as many tiles of at least
 * 72px as fit (two to six), sized so a row fills the width without wrapping.
 */
export function themeGrid(width: number, gap: number): { columns: number; size: number } {
  const fit = Math.floor((width + gap) / (THEME_TILE_MIN + gap));
  const columns = Math.min(THEME_COLUMNS_MAX, Math.max(2, fit));
  const size = Math.max(0, Math.floor((width - gap * (columns - 1)) / columns));
  return { columns, size };
}
