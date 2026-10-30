// C:\OOTDify\src\features\community\chatThread.ts
// Pure rules for what you can do with a chat message: the long-press actions,
// the edit window, reactions (one per person per message), reply quotes and
// merging live updates. The database enforces the same rules (migration
// 20261030120000_chat_actions.sql); these decide what the screen offers.
import { PHOTO_BODY } from "./chatMedia";

/** The message fields these rules read. */
export interface ThreadMessage {
  id: string;
  sender_id: string;
  body: string;
  image_ref: string | null;
  created_at: string;
  reply_to: string | null;
  edited_at: string | null;
  unsent_at: string | null;
}

export type MessageAction = "react" | "reply" | "edit" | "unsend_everyone" | "remove_for_me";

/** How long after sending a text message its sender may still edit it. */
export const EDIT_WINDOW_MS = 15 * 60_000;

/** The quick reactions above the action sheet; the full emoji tray offers the rest. */
export const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"] as const;

export function canEditMessage(m: ThreadMessage, meId: string | null, now: number): boolean {
  if (m.sender_id !== meId || m.unsent_at !== null || m.image_ref !== null) return false;
  const age = now - Date.parse(m.created_at);
  return age >= 0 && age <= EDIT_WINDOW_MS;
}

/** The long-press actions a message offers the viewer, in sheet order. */
export function messageActions(m: ThreadMessage, meId: string | null, now: number): MessageAction[] {
  if (m.unsent_at !== null) return ["remove_for_me"];
  const actions: MessageAction[] = ["react", "reply"];
  if (canEditMessage(m, meId, now)) actions.push("edit");
  if (m.sender_id === meId) actions.push("unsend_everyone");
  actions.push("remove_for_me");
  return actions;
}

/** A message_reactions row. A null emoji is a removed reaction. */
export interface ReactionRow {
  message_id: string;
  user_id: string;
  emoji: string | null;
  created_at: string;
}

export interface ReactionChip {
  emoji: string;
  count: number;
  mine: boolean;
}

/** One message's reactions as chips: most used first, ties to the emoji used first. */
export function reactionChips(rows: ReactionRow[], meId: string | null): ReactionChip[] {
  const byEmoji = new Map<string, ReactionChip & { first: number }>();
  for (const r of rows) {
    if (!r.emoji) continue;
    const at = Date.parse(r.created_at);
    const chip = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, first: at };
    chip.count += 1;
    chip.mine ||= r.user_id === meId;
    chip.first = Math.min(chip.first, at);
    byEmoji.set(r.emoji, chip);
  }
  return [...byEmoji.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .map(({ emoji, count, mine }) => ({ emoji, count, mine }));
}

/** Picking the emoji I already reacted with removes my reaction. */
export function nextReaction(current: string | null, picked: string): string | null {
  return current === picked ? null : picked;
}

/** Insert or replace a reaction row (one per person per message). */
export function applyReaction(rows: ReactionRow[], row: ReactionRow): ReactionRow[] {
  const rest = rows.filter((r) => !(r.message_id === row.message_id && r.user_id === row.user_id));
  return [...rest, row];
}

export type Quote = { kind: "missing" } | { kind: "unsent" } | { kind: "text" | "photo"; text: string };

/** What a reply bubble shows of the message it answers. */
export function quoteOf(original: ThreadMessage | undefined): Quote {
  if (!original) return { kind: "missing" };
  if (original.unsent_at !== null) return { kind: "unsent" };
  const text = original.body.trim();
  if (original.image_ref) return { kind: "photo", text: text === PHOTO_BODY ? "" : text };
  return { kind: "text", text };
}

/**
 * Apply a live UPDATE (edit or unsend) to the loaded thread. Fields realtime
 * does not carry (sender name, avatar) are kept; unknown ids are ignored.
 */
export function mergeMessage<T extends ThreadMessage>(list: T[], row: ThreadMessage): T[] {
  const i = list.findIndex((m) => m.id === row.id);
  if (i < 0) return list;
  const next = [...list];
  next[i] = {
    ...list[i],
    body: row.body,
    image_ref: row.image_ref,
    reply_to: row.reply_to,
    edited_at: row.edited_at,
    unsent_at: row.unsent_at,
  };
  return next;
}

/**
 * The first message I hadn't read when I opened the thread: from someone
 * else, not unsent, after my last read. Null when everything was read.
 */
export function firstUnreadId(messages: ThreadMessage[], lastReadAt: string | null, meId: string | null): string | null {
  const since = lastReadAt ? Date.parse(lastReadAt) : -Infinity;
  const first = messages.find(
    (m) => m.sender_id !== meId && !m.unsent_at && Date.parse(m.created_at) > since,
  );
  return first?.id ?? null;
}

/** "Sent" or "Seen" under my last message in a DM; null when the last message isn't mine. */
export function seenState(
  last: ThreadMessage | undefined,
  peerLastReadAt: string | null,
  meId: string | null,
): "sent" | "seen" | null {
  if (!last || last.sender_id !== meId || last.unsent_at) return null;
  return peerLastReadAt && Date.parse(peerLastReadAt) >= Date.parse(last.created_at) ? "seen" : "sent";
}
