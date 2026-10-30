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

interface Threadable {
  id: string;
  parent_id?: string | null;
}

/** Top-level comments in order, each with its replies (one level deep). */
export function threadComments<C extends Threadable>(rows: C[]): { comment: C; replies: C[] }[] {
  const threads = rows.filter((c) => !c.parent_id).map((comment) => ({ comment, replies: [] as C[] }));
  const byId = new Map(threads.map((t) => [t.comment.id, t]));
  for (const c of rows) {
    if (c.parent_id) byId.get(c.parent_id)?.replies.push(c);
  }
  return threads;
}

/** Replies hang off the top-level comment, so answering a reply joins its thread. */
export function replyParentId(c: Threadable): string {
  return c.parent_id ?? c.id;
}
