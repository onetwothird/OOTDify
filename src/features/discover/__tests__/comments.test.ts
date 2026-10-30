import { COMMENT_MAX, canDeleteComment, commentDraft } from "../comments";

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
