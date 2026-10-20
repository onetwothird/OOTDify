// C:\OOTDify\src\features\community\types.ts
// Row shapes for the community feature (supabase/schema.sql):
//   community_posts / community_likes / community_comments
//   conversations / conversation_participants / messages
// plus the client-side view models the screens render.

/** Mirrors a public.community_posts row. */
export interface CommunityPost {
  id: string;
  user_id: string;
  saved_outfit_id: string | null;
  title: string | null;
  caption: string | null;
  /** Stored media refs (`community/uid/...`) or public URLs. */
  image_urls: string[];
  /** Maintained by SQL triggers — clients never write these. */
  like_count: number;
  comment_count: number;
  created_at: string;
}

/** The only columns exposed by the community_directory view. */
export interface DirectoryProfile {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  avatar_url: string | null;
}

/** A feed post enriched with author info and the viewer's like state. */
export interface FeedPost extends CommunityPost {
  author: DirectoryProfile | null;
  likedByMe: boolean;
}

/** Mirrors a public.community_comments row. */
export interface CommunityComment {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

/** A comment enriched with its author (join done client-side). */
export interface FeedComment extends CommunityComment {
  authorName: string;
}

/** A conversation row in the Chats list, enriched for display. */
export interface ConversationListEntry {
  id: string;
  /** True for the shared everyone-can-join room (fixed UUID). */
  isRoom: boolean;
  otherUserId: string | null;
  otherName: string;
  /** The peer's avatar ref (null when unset — render an initial instead). */
  otherAvatar: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
}

/** Mirrors a public.messages row, enriched with the sender's name. */
export interface ChatMessageEntry {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  senderName: string;
  /** Sender's avatar ref; null for realtime inserts (resolved by the screen). */
  senderAvatar: string | null;
}
