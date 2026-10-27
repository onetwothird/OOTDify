import {
  firstUnseenIndex,
  friendStateWith,
  groupMyDay,
  isOnline,
  presenceOf,
  ONLINE_WINDOW_MS,
  splitFriendships,
  type FriendshipRow,
  type MyDayPostRow,
} from "../social";

const NOW = Date.parse("2026-10-28T12:00:00Z");

describe("isOnline", () => {
  it("is online inside the window and offline after it", () => {
    expect(isOnline(new Date(NOW - 30_000).toISOString(), NOW)).toBe(true);
    expect(isOnline(new Date(NOW - ONLINE_WINDOW_MS - 1).toISOString(), NOW)).toBe(false);
  });

  it("treats missing or broken timestamps as offline", () => {
    expect(isOnline(null, NOW)).toBe(false);
    expect(isOnline("not a date", NOW)).toBe(false);
  });
});

const rows: FriendshipRow[] = [
  { requester_id: "me", addressee_id: "a", status: "accepted", created_at: "" },
  { requester_id: "b", addressee_id: "me", status: "pending", created_at: "" },
  { requester_id: "me", addressee_id: "c", status: "pending", created_at: "" },
];

describe("friendships", () => {
  it("reads the state in either direction", () => {
    expect(friendStateWith(rows, "me", "a")).toBe("friends");
    expect(friendStateWith(rows, "me", "b")).toBe("incoming");
    expect(friendStateWith(rows, "me", "c")).toBe("outgoing");
    expect(friendStateWith(rows, "me", "d")).toBe("none");
  });

  it("splits rows into friends and requests", () => {
    expect(splitFriendships(rows, "me")).toEqual({ friends: ["a"], incoming: ["b"], outgoing: ["c"] });
  });
});

const post = (id: string, user: string, minutesAgo: number, expiresIn = 60): MyDayPostRow => ({
  id,
  user_id: user,
  image_ref: `myday/${user}/${id}.jpg`,
  caption: null,
  created_at: new Date(NOW - minutesAgo * 60_000).toISOString(),
  expires_at: new Date(NOW + expiresIn * 60_000).toISOString(),
});

describe("groupMyDay", () => {
  it("puts your own first, then unseen, then seen, newest first", () => {
    const posts = [post("s1", "seen", 1), post("u1", "old", 50), post("u2", "new", 5), post("m1", "me", 90)];
    const groups = groupMyDay(posts, new Set(["s1"]), "me", NOW);
    expect(groups.map((g) => g.userId)).toEqual(["me", "new", "old", "seen"]);
    expect(groups.map((g) => g.seen)).toEqual([true, false, false, true]);
  });

  it("plays oldest first and drops expired posts", () => {
    const posts = [post("b", "x", 5), post("a", "x", 30), post("gone", "x", 1, -1)];
    const [group] = groupMyDay(posts, new Set(), "me", NOW);
    expect(group.posts.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("is unseen until every post has been viewed", () => {
    const posts = [post("a", "x", 30), post("b", "x", 5)];
    expect(groupMyDay(posts, new Set(["a"]), "me", NOW)[0].seen).toBe(false);
    expect(groupMyDay(posts, new Set(["a", "b"]), "me", NOW)[0].seen).toBe(true);
  });
});

describe("firstUnseenIndex", () => {
  it("resumes at the first unseen post, or starts over when all are seen", () => {
    const posts = [post("a", "x", 30), post("b", "x", 5)];
    expect(firstUnseenIndex(posts, new Set(["a"]))).toBe(1);
    expect(firstUnseenIndex(posts, new Set(["a", "b"]))).toBe(0);
  });
});

describe("presenceOf", () => {
  const recent = new Date(NOW - 30_000).toISOString();
  const stale = new Date(NOW - ONLINE_WINDOW_MS - 1).toISOString();

  it("shows the status the friend picked while they are around", () => {
    expect(presenceOf(recent, "online", NOW)).toBe("online");
    expect(presenceOf(recent, "idle", NOW)).toBe("idle");
    expect(presenceOf(recent, "dnd", NOW)).toBe("dnd");
  });

  it("is offline once they stop checking in, whatever they picked", () => {
    expect(presenceOf(stale, "dnd", NOW)).toBe("offline");
    expect(presenceOf(null, "online", NOW)).toBe("offline");
  });

  it("treats an unknown status as online", () => {
    expect(presenceOf(recent, "weird", NOW)).toBe("online");
  });
});
