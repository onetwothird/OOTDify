import { groupInbox, inQuietHours, routeFor, type InboxRow } from "../inbox";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const row = (over: Partial<InboxRow>): InboxRow => ({
  id: Math.random().toString(36).slice(2),
  type: "post_like",
  actor_id: "a",
  conversation_id: null,
  post_id: null,
  preview: null,
  read_at: null,
  created_at: new Date(NOW - 60_000).toISOString(),
  ...over,
});

describe("groupInbox", () => {
  it("bundles unread messages from one chat into a single entry", () => {
    const rows = [
      row({ id: "m3", type: "message", conversation_id: "c1", created_at: new Date(NOW - 1_000).toISOString() }),
      row({ id: "m2", type: "message", conversation_id: "c1", created_at: new Date(NOW - 2_000).toISOString() }),
      row({ id: "x", type: "friend_request" }),
      row({ id: "m1", type: "message", conversation_id: "c2" }),
    ];
    const items = groupInbox(rows);
    expect(items.map((i) => i.row.id)).toEqual(["m3", "x", "m1"]);
    expect(items[0].count).toBe(2);
    expect(items[0].ids.sort()).toEqual(["m2", "m3"]);
  });

  it("keeps read messages apart from unread ones", () => {
    const items = groupInbox([
      row({ id: "new", type: "message", conversation_id: "c1" }),
      row({ id: "old", type: "message", conversation_id: "c1", read_at: "2026-10-28T11:00:00Z" }),
    ]);
    expect(items.map((i) => i.count)).toEqual([1, 1]);
  });
});

describe("routeFor", () => {
  it("opens the place each kind is about", () => {
    expect(routeFor(row({ type: "message", conversation_id: "c1" }))).toEqual({ kind: "chat", id: "c1" });
    expect(routeFor(row({ type: "room_join", conversation_id: "c1" }))).toEqual({ kind: "chat", id: "c1" });
    expect(routeFor(row({ type: "friend_request" }))).toEqual({ kind: "friends" });
    expect(routeFor(row({ type: "friend_accepted" }))).toEqual({ kind: "friends" });
    expect(routeFor(row({ type: "my_day", actor_id: "u" }))).toEqual({ kind: "myday", id: "u" });
    expect(routeFor(row({ type: "post_comment" }))).toEqual({ kind: "feed" });
    expect(routeFor(row({ type: "my_day_like", my_day_post_id: "p1" }))).toEqual({ kind: "my-myday", postId: "p1" });
    expect(routeFor(row({ type: "my_day_comment" }))).toEqual({ kind: "my-myday", postId: null });
  });
});

describe("inQuietHours", () => {
  it("handles windows within a day and across midnight", () => {
    expect(inQuietHours(13, 15, 14)).toBe(true);
    expect(inQuietHours(13, 15, 15)).toBe(false);
    expect(inQuietHours(22, 7, 23)).toBe(true);
    expect(inQuietHours(22, 7, 3)).toBe(true);
    expect(inQuietHours(22, 7, 12)).toBe(false);
  });

  it("is off when unset or empty", () => {
    expect(inQuietHours(null, null, 3)).toBe(false);
    expect(inQuietHours(5, 5, 5)).toBe(false);
  });
});
