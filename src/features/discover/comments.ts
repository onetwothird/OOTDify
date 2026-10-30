// Comment rules shared by looks and pieces in Discover. Pure, so tested.

/** Longest comment, matching the database check on piece comments. */
export const COMMENT_MAX = 1000;

/** The trimmed draft and whether it can be sent. */
export function commentDraft(raw: string): { body: string; canSend: boolean; tooLong: boolean; left: number } {
  const body = raw.trim();
  const tooLong = body.length > COMMENT_MAX;
  return { body, canSend: body.length > 0 && !tooLong, tooLong, left: COMMENT_MAX - body.length };
}

/** My own comment, or any comment on my post or piece. */
export function canDeleteComment(authorId: string, meId: string | null, ownerId: string): boolean {
  return meId !== null && (authorId === meId || ownerId === meId);
}
