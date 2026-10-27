// C:\OOTDify\src\features\notifications\inbox.ts
// Pure rules for the notifications inbox: bundling chat messages, where a
// tap goes, and quiet hours. The database writes the rows (migration
// 20261028150000); this only shapes them for the screen.

export type NotificationType =
  | "message"
  | "friend_request"
  | "friend_accepted"
  | "post_like"
  | "post_comment"
  | "comment_thread"
  | "my_day"
  | "room_join"
  | "my_day_like"
  | "my_day_comment";

export interface InboxRow {
  id: string;
  type: NotificationType;
  actor_id: string | null;
  conversation_id: string | null;
  post_id: string | null;
  my_day_post_id?: string | null;
  preview: string | null;
  read_at: string | null;
  created_at: string;
}

export interface InboxItem {
  /** The newest row of the bundle; it decides the text, time and target. */
  row: InboxRow;
  /** Every row the item stands for, so marking it read clears them all. */
  ids: string[];
  count: number;
}

/**
 * Newest first. Unread messages from the same chat become one entry ("3 new
 * messages"); everything else stays one row per entry.
 */
export function groupInbox(rows: InboxRow[]): InboxItem[] {
  const sorted = [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const items: InboxItem[] = [];
  const bundles = new Map<string, InboxItem>();
  for (const r of sorted) {
    if (r.type === "message" && r.conversation_id && !r.read_at) {
      const existing = bundles.get(r.conversation_id);
      if (existing) {
        existing.ids.push(r.id);
        existing.count += 1;
        continue;
      }
      const item = { row: r, ids: [r.id], count: 1 };
      bundles.set(r.conversation_id, item);
      items.push(item);
      continue;
    }
    items.push({ row: r, ids: [r.id], count: 1 });
  }
  return items;
}

export type InboxRoute =
  | { kind: "chat"; id: string }
  | { kind: "myday"; id: string }
  | { kind: "my-myday"; postId: string | null }
  | { kind: "friends" }
  | { kind: "feed" };

/** Where tapping a notification (in the inbox or on the phone) should go. */
export function routeFor(
  row: Pick<InboxRow, "type" | "actor_id" | "conversation_id"> & { my_day_post_id?: string | null },
): InboxRoute {
  if ((row.type === "message" || row.type === "room_join") && row.conversation_id) {
    return { kind: "chat", id: row.conversation_id };
  }
  if (row.type === "friend_request" || row.type === "friend_accepted") return { kind: "friends" };
  if (row.type === "my_day" && row.actor_id) return { kind: "myday", id: row.actor_id };
  // Hearts and comments are on your own My Day.
  if (row.type === "my_day_like" || row.type === "my_day_comment") {
    return { kind: "my-myday", postId: row.my_day_post_id ?? null };
  }
  return { kind: "feed" };
}

/** True when `hour` (0–23) falls in the quiet window; a window may cross midnight. */
export function inQuietHours(start: number | null, end: number | null, hour: number): boolean {
  if (start === null || end === null || start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
