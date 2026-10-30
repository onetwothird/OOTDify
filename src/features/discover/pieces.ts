// Public closet pieces in Discover: which ones show, and how the viewer
// relates to each creator. Pure, so the rules are unit-tested.

/** The clothing_items fields Discover shows for a public piece. */
export interface PublicPiece {
  id: string;
  user_id: string;
  name: string | null;
  category: string | null;
  image_url: string | null;
  is_public: boolean;
  like_count: number;
  comment_count: number;
  created_at: string;
}

/** Other people's public pieces that have a photo, newest first. Friends or not. */
export function discoverPieces<T extends PublicPiece>(items: T[], me: string | null): T[] {
  return items
    .filter((p) => p.is_public && p.image_url && p.user_id !== me)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export type FriendState = "self" | "friend" | "incoming" | "outgoing" | "none" | "unknown";

/** Friend ids by relation, as fetchFriends returns them. */
export interface FriendIds {
  me: string;
  friends: string[];
  incoming: string[];
  outgoing: string[];
}

/** Which add-friend control a creator gets; "unknown" until friends load. */
export function friendState(userId: string, ids: FriendIds | null): FriendState {
  if (!ids) return "unknown";
  if (userId === ids.me) return "self";
  if (ids.friends.includes(userId)) return "friend";
  if (ids.incoming.includes(userId)) return "incoming";
  if (ids.outgoing.includes(userId)) return "outgoing";
  return "none";
}

/** The look I saved from this post, if any. */
export function savedLookFor<T extends { source_post_id: string | null }>(outfits: T[], postId: string): T | undefined {
  return outfits.find((o) => o.source_post_id === postId);
}
