import {
  EDIT_WINDOW_MS,
  applyReaction,
  canEditMessage,
  firstUnreadId,
  mergeMessage,
  messageActions,
  nextReaction,
  quoteOf,
  reactionChips,
  seenState,
  type ReactionRow,
  type ThreadMessage,
} from "../chatThread";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const ME = "me";

function msg(over: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: "m1",
    sender_id: ME,
    body: "hello",
    image_ref: null,
    created_at: new Date(NOW - 60_000).toISOString(),
    reply_to: null,
    edited_at: null,
    unsent_at: null,
    ...over,
  };
}

describe("messageActions", () => {
  it("offers my own recent text message every action", () => {
    expect(messageActions(msg(), ME, NOW)).toEqual(["react", "reply", "edit", "unsend_everyone", "remove_for_me"]);
  });

  it("never lets me edit or unsend someone else's message", () => {
    expect(messageActions(msg({ sender_id: "ana" }), ME, NOW)).toEqual(["react", "reply", "remove_for_me"]);
  });

  it("only lets me remove an unsent message for myself", () => {
    expect(messageActions(msg({ unsent_at: new Date(NOW).toISOString() }), ME, NOW)).toEqual(["remove_for_me"]);
  });

  it("drops edit once the window has passed but keeps unsend", () => {
    const old = msg({ created_at: new Date(NOW - EDIT_WINDOW_MS - 1).toISOString() });
    expect(messageActions(old, ME, NOW)).toEqual(["react", "reply", "unsend_everyone", "remove_for_me"]);
  });
});

describe("canEditMessage", () => {
  it("is false for photo messages", () => {
    expect(canEditMessage(msg({ image_ref: "chat/c/me/x.jpg" }), ME, NOW)).toBe(false);
  });

  it("is true right at the edge of the 15 minute window", () => {
    expect(EDIT_WINDOW_MS).toBe(15 * 60_000);
    expect(canEditMessage(msg({ created_at: new Date(NOW - EDIT_WINDOW_MS).toISOString() }), ME, NOW)).toBe(true);
  });
});

describe("reactions", () => {
  const row = (user_id: string, emoji: string | null, at = 0): ReactionRow => ({
    message_id: "m1",
    user_id,
    emoji,
    created_at: new Date(NOW + at).toISOString(),
  });

  it("groups by emoji, most used first, marks mine and skips removed ones", () => {
    const chips = reactionChips([row("a", "😂", 1), row("b", "❤️", 2), row("me", "❤️", 3), row("c", null, 4)], ME);
    expect(chips).toEqual([
      { emoji: "❤️", count: 2, mine: true },
      { emoji: "😂", count: 1, mine: false },
    ]);
  });

  it("breaks count ties by whichever emoji was used first", () => {
    expect(reactionChips([row("a", "🔥", 5), row("b", "👍", 1)], ME).map((c) => c.emoji)).toEqual(["👍", "🔥"]);
  });

  it("toggles off when picking the emoji I already chose", () => {
    expect(nextReaction("❤️", "❤️")).toBeNull();
    expect(nextReaction("❤️", "😂")).toBe("😂");
    expect(nextReaction(null, "😂")).toBe("😂");
  });

  it("upserts one row per person per message", () => {
    const rows = applyReaction([row("a", "😂")], row("a", "❤️", 9));
    expect(rows).toHaveLength(1);
    expect(rows[0].emoji).toBe("❤️");
    expect(applyReaction(rows, { ...row("b", "👍"), message_id: "m2" })).toHaveLength(2);
  });
});

describe("quoteOf", () => {
  it("describes what a reply points at", () => {
    expect(quoteOf(undefined)).toEqual({ kind: "missing" });
    expect(quoteOf(msg({ unsent_at: new Date(NOW).toISOString() }))).toEqual({ kind: "unsent" });
    expect(quoteOf(msg({ body: "  see you  " }))).toEqual({ kind: "text", text: "see you" });
    expect(quoteOf(msg({ image_ref: "chat/x", body: "📷 Photo" }))).toEqual({ kind: "photo", text: "" });
    expect(quoteOf(msg({ image_ref: "chat/x", body: "fit check" }))).toEqual({ kind: "photo", text: "fit check" });
  });
});

describe("mergeMessage", () => {
  type Named = ThreadMessage & { senderName: string };
  const named = (over: Partial<Named> = {}): Named => ({ ...msg(), senderName: "Me", ...over });

  it("updates a known message in place and keeps the fields realtime does not carry", () => {
    const list = [named({ id: "a" }), named({ id: "b" })];
    const out = mergeMessage(list, msg({ id: "a", body: "", unsent_at: "2026-10-30T12:00:00Z" }));
    expect(out[0]).toMatchObject({ id: "a", body: "", senderName: "Me" });
    expect(out[0].unsent_at).not.toBeNull();
    expect(out[1]).toBe(list[1]);
  });

  it("ignores updates for messages not loaded", () => {
    const list = [named({ id: "a" })];
    expect(mergeMessage(list, msg({ id: "zz" }))).toBe(list);
  });
});

describe("firstUnreadId", () => {
  const at = (min: number) => new Date(NOW - min * 60_000).toISOString();
  const thread = [
    msg({ id: "a", sender_id: "peer", created_at: at(30) }),
    msg({ id: "b", sender_id: ME, created_at: at(20) }),
    msg({ id: "c", sender_id: "peer", created_at: at(10) }),
    msg({ id: "d", sender_id: "peer", created_at: at(5) }),
  ];

  it("marks the first message from someone else after I last read", () => {
    expect(firstUnreadId(thread, at(15), ME)).toBe("c");
  });

  it("skips my own messages and unsent ones", () => {
    const withUnsent = [msg({ id: "x", sender_id: "peer", created_at: at(12), unsent_at: at(11) }), ...thread.slice(2)];
    expect(firstUnreadId(withUnsent, at(15), ME)).toBe("c");
    expect(firstUnreadId([thread[1]], at(25), ME)).toBeNull();
  });

  it("marks everything from others when I never opened the chat", () => {
    expect(firstUnreadId(thread, null, ME)).toBe("a");
  });

  it("marks nothing when all is read", () => {
    expect(firstUnreadId(thread, at(1), ME)).toBeNull();
  });
});

describe("seenState", () => {
  const mine = msg({ sender_id: ME, created_at: new Date(NOW - 60_000).toISOString() });

  it("says Seen once the other person read past my last message", () => {
    expect(seenState(mine, new Date(NOW).toISOString(), ME)).toBe("seen");
  });

  it("says Sent until then", () => {
    expect(seenState(mine, new Date(NOW - 120_000).toISOString(), ME)).toBe("sent");
    expect(seenState(mine, null, ME)).toBe("sent");
  });

  it("says nothing when the last message isn't mine or was unsent", () => {
    expect(seenState(msg({ sender_id: "peer" }), null, ME)).toBeNull();
    expect(seenState(msg({ sender_id: ME, unsent_at: new Date(NOW).toISOString() }), null, ME)).toBeNull();
    expect(seenState(undefined, null, ME)).toBeNull();
  });
});
