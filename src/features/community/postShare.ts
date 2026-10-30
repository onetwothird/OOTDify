// C:\OOTDify\src\features\community\postShare.ts
// Pure rules for sharing feed posts: the ⋯ menu, reshares, sending a post in
// a chat, sharing outside the app, "See more" captions and double-tap likes.
// The database enforces the matching rules (migration
// 20261030140000_post_sharing.sql).

export type PostMenuAction = "save" | "unsave" | "send" | "share_out" | "view_profile" | "hide" | "delete";

/** The ⋯ menu, in order. You can't hide your own post; you delete it. */
export function postMenuActions({ isOwn, saved }: { isOwn: boolean; saved: boolean }): PostMenuAction[] {
  const actions: PostMenuAction[] = [saved ? "unsave" : "save", "send", "share_out"];
  if (isOwn) actions.push("delete");
  else actions.push("view_profile", "hide");
  return actions;
}

/** A reshare always points at the original post, never at another reshare. */
export function reshareTarget(post: { id: string; reshared_from: string | null }): string {
  return post.reshared_from ?? post.id;
}

const SEE_MORE_CHARS = 180;
const SEE_MORE_LINES = 4;

/** True when a caption is long enough to fold behind "See more". */
export function needsSeeMore(caption: string | null): boolean {
  if (!caption) return false;
  return caption.length > SEE_MORE_CHARS || caption.split("\n").length > SEE_MORE_LINES;
}

export const SEE_MORE_LINES_SHOWN = SEE_MORE_LINES;

/** Two taps on a photo within this long like the post. */
export const DOUBLE_TAP_MS = 280;

export function isDoubleTap(lastTapAt: number | null, now: number): boolean {
  return lastTapAt !== null && now - lastTapAt <= DOUBLE_TAP_MS;
}

/** The body of a chat message that carries a post (the card shows the post). */
export const SHARED_POST_BODY = "📌 Shared a post";

export function sharedPostBody(note: string): string {
  return note.trim() || SHARED_POST_BODY;
}

/** What the phone's share sheet receives for a post. */
export function shareOutText(
  post: { title: string | null; caption: string | null },
  authorName: string,
  imageUrl: string | null,
): string {
  const head = post.title ? `${post.title} by ${authorName} on OOTDify` : `A look by ${authorName} on OOTDify`;
  return [head, post.caption?.trim() || null, imageUrl].filter(Boolean).join("\n");
}

/** The feed without the posts I hid. */
export function visiblePosts<T extends { id: string }>(posts: T[], hiddenIds: ReadonlySet<string>): T[] {
  return posts.filter((p) => !hiddenIds.has(p.id));
}
