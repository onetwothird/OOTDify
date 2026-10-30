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
export interface ChatTheme {
  key: string;
  bubble: string;
  onBubble: string;
}

/**
 * The themes a conversation can use (conversations.chat_theme). The default
 * (null) keeps the app theme's own colours. Each bubble passes 4.5:1 against
 * its text colour.
 */
export const CHAT_THEMES: readonly ChatTheme[] = [
  { key: "denim", bubble: "#2F4A7A", onBubble: "#FFFFFF" },
  { key: "copper", bubble: "#9A4E1E", onBubble: "#FFFFFF" },
  { key: "olive", bubble: "#4F5D2F", onBubble: "#FFFFFF" },
  { key: "plum", bubble: "#6B2D5C", onBubble: "#FFFFFF" },
  { key: "teal", bubble: "#0F6466", onBubble: "#FFFFFF" },
  { key: "rose", bubble: "#B03A5B", onBubble: "#FFFFFF" },
  { key: "charcoal", bubble: "#33363B", onBubble: "#FFFFFF" },
  { key: "butter", bubble: "#F2D27A", onBubble: "#2B2410" },
];

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
