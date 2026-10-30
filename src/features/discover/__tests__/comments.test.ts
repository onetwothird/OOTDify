import { COMMENT_MAX, canDeleteComment, commentDraft, replyParentId, threadComments } from "../comments";

describe("commentDraft", () => {
  it("can be sent once it has text within the limit", () => {
    expect(commentDraft("  nice fit  ")).toEqual({ body: "nice fit", canSend: true, tooLong: false, left: COMMENT_MAX - 8 });
  });

  it("can't be sent empty or over the limit", () => {
    expect(commentDraft("   ").canSend).toBe(false);
    const long = commentDraft("x".repeat(COMMENT_MAX + 1));
    expect(long).toMatchObject({ canSend: false, tooLong: true, left: -1 });
  });
});

describe("canDeleteComment", () => {
  it("lets me delete my own comment", () => {
    expect(canDeleteComment("me", "me", "owner")).toBe(true);
  });

  it("lets the owner of the post or piece delete any comment on it", () => {
    expect(canDeleteComment("someone", "owner", "owner")).toBe(true);
  });

  it("doesn't let anyone else delete it", () => {
    expect(canDeleteComment("someone", "me", "owner")).toBe(false);
    expect(canDeleteComment("someone", null, "owner")).toBe(false);
  });
});

describe("threadComments", () => {
  const c = (id: string, parent_id: string | null = null) => ({ id, parent_id });

  it("puts each reply under its comment, oldest first, keeping comment order", () => {
    const rows = [c("a"), c("b"), c("r1", "a"), c("r2", "b"), c("r3", "a")];
    expect(threadComments(rows)).toEqual([
      { comment: c("a"), replies: [c("r1", "a"), c("r3", "a")] },
      { comment: c("b"), replies: [c("r2", "b")] },
    ]);
  });

  it("drops a reply whose comment isn't loaded", () => {
    expect(threadComments([c("a"), c("r", "gone")])).toEqual([{ comment: c("a"), replies: [] }]);
  });
});

describe("replyParentId", () => {
  it("answers a top-level comment directly, and a reply's comment for a reply", () => {
    expect(replyParentId({ id: "a", parent_id: null })).toBe("a");
    expect(replyParentId({ id: "r", parent_id: "a" })).toBe("a");
  });
});
