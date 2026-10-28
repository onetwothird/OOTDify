// C:\OOTDify\src\features\community\social.ts
// Pure rules behind friends, online status and My Day, kept apart from the
// Supabase calls so they can be tested directly.
import type { ConversationListEntry } from "./types";

/** A friend counts as online when the app checked in within this window. */
export const ONLINE_WINDOW_MS = 150_000;
/** How often an open app checks in (comfortably inside the window). */
export const HEARTBEAT_MS = 60_000;

export function isOnline(lastSeenAt: string | null | undefined, now: number): boolean {
  if (!lastSeenAt) return false;
  const seen = Date.parse(lastSeenAt);
  if (Number.isNaN(seen)) return false;
  return now - seen <= ONLINE_WINDOW_MS;
}

export interface FriendshipRow {
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  created_at: string;
}

export type FriendState = "none" | "friends" | "outgoing" | "incoming";

/** Where the signed-in user stands with someone else. */
export function friendStateWith(rows: FriendshipRow[], me: string, other: string): FriendState {
  const row = rows.find(
    (r) =>
      (r.requester_id === me && r.addressee_id === other) ||
      (r.requester_id === other && r.addressee_id === me),
  );
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.requester_id === me ? "outgoing" : "incoming";
}

/** Splits the user's friendship rows into friends and the two kinds of request. */
export function splitFriendships(rows: FriendshipRow[], me: string) {
  const friends: string[] = [];
  const incoming: string[] = [];
  const outgoing: string[] = [];
  for (const r of rows) {
    const other = r.requester_id === me ? r.addressee_id : r.requester_id;
    if (r.status === "accepted") friends.push(other);
    else if (r.requester_id === me) outgoing.push(other);
    else incoming.push(other);
  }
  return { friends, incoming, outgoing };
}

export interface MyDayPostRow {
  id: string;
  user_id: string;
  image_ref: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
}

export interface MyDayGroup {
  userId: string;
  /** Oldest first, the order they play in. */
  posts: MyDayPostRow[];
  /** True when every post in the group has been seen (own posts count as seen). */
  seen: boolean;
  latestAt: string;
}

/**
 * Groups live posts by person for the My Day tray: your own first, then
 * friends with something unseen, then the rest, newest activity first.
 */
export function groupMyDay(
  posts: MyDayPostRow[],
  viewedPostIds: ReadonlySet<string>,
  me: string,
  now: number,
): MyDayGroup[] {
  const byUser = new Map<string, MyDayPostRow[]>();
  for (const p of posts) {
    if (Date.parse(p.expires_at) <= now) continue;
    const list = byUser.get(p.user_id) ?? [];
    list.push(p);
    byUser.set(p.user_id, list);
  }
  const groups: MyDayGroup[] = [];
  for (const [userId, list] of byUser) {
    list.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    groups.push({
      userId,
      posts: list,
      seen: userId === me || list.every((p) => viewedPostIds.has(p.id)),
      latestAt: list[list.length - 1].created_at,
    });
  }
  const rank = (g: MyDayGroup) => (g.userId === me ? 0 : g.seen ? 2 : 1);
  return groups.sort(
    (a, b) => rank(a) - rank(b) || Date.parse(b.latestAt) - Date.parse(a.latestAt),
  );
}

/** Index of the first post the viewer has not seen yet, or 0 when all are seen. */
export function firstUnseenIndex(posts: MyDayPostRow[], viewedPostIds: ReadonlySet<string>): number {
  const i = posts.findIndex((p) => !viewedPostIds.has(p.id));
  return i === -1 ? 0 : i;
}

export type PickedStatus = "online" | "idle" | "dnd";
export type Presence = PickedStatus | "offline";

/**
 * What a friend's dot shows: the status they picked while they are checking
 * in, and offline once they stop (or hide their status, so no row is read).
 */
export function presenceOf(lastSeenAt: string | null | undefined, status: string | null | undefined, now: number): Presence {
  if (!isOnline(lastSeenAt, now)) return "offline";
  return status === "idle" || status === "dnd" ? status : "online";
}

/**
 * The private chat with each friend, keyed by that friend's id. The everyone
 * room and group rooms are left out: they belong to Community, not Friends.
 */
export function dmsByFriend(entries: ConversationListEntry[]): Map<string, ConversationListEntry> {
  const map = new Map<string, ConversationListEntry>();
  for (const e of entries) {
    if (e.isRoom || e.isGroup || !e.otherUserId) continue;
    map.set(e.otherUserId, e);
  }
  return map;
}

/** A note is one short line, like a status, shown above your circle for a day. */
export const NOTE_MAX = 60;

export function cleanNote(raw: string): { ok: true; note: string } | { ok: false; error: "empty" | "too_long" } {
  const note = raw.replace(/\s+/g, " ").trim();
  if (!note) return { ok: false, error: "empty" };
  if (note.length > NOTE_MAX) return { ok: false, error: "too_long" };
  return { ok: true, note };
}

export interface FriendNote {
  body: string;
  expiresAt: string;
}

export function noteIsLive(note: FriendNote, now: number): boolean {
  const expires = Date.parse(note.expiresAt);
  return !Number.isNaN(expires) && expires > now;
}
