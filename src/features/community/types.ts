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
  /** The original post this one reshares, or null. */
  reshared_from: string | null;
  /** How many times this post was reshared (trigger-maintained). */
  reshare_count: number;
  created_at: string;
}

/** The only columns exposed by the community_directory view. */
export interface DirectoryProfile {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  avatar_url: string | null;
}

/** What a friend's profile page shows (get_friend_profile; friends only). */
export interface FriendProfile extends DirectoryProfile {
  bio: string | null;
  cover_url: string | null;
}

/** A feed post enriched with author info and the viewer's like state. */
export interface FeedPost extends CommunityPost {
  author: DirectoryProfile | null;
  likedByMe: boolean;
  savedByMe: boolean;
  /** For a reshare, the post it reshares (null if deleted or not a reshare). */
  original: FeedPost | null;
}

/** Mirrors a public.community_comments row. */
export interface CommunityComment {
  id: string;
  post_id: string;
  user_id: string;
  /** The top-level comment this replies to; null for a top-level comment. */
  parent_id?: string | null;
  body: string;
  created_at: string;
}

/** A comment enriched with its author (join done client-side). */
export interface FeedComment extends CommunityComment {
  authorName: string;
  /** The commenter's photo ref (null when unset: render their initial). */
  authorAvatar: string | null;
}

/** A conversation row in the Chats list, enriched for display. */
export interface ConversationListEntry {
  id: string;
  /** True for the shared everyone-can-join room (fixed UUID). */
  isRoom: boolean;
  /**
   * True when this is a public GROUP ROOM created by a user. Group rooms are
   * listed under Communities, not Direct Messages, so the screen filters on
   * this rather than on whether the room happens to be in the discover window.
   */
  isGroup: boolean;
  /** Group rooms: the room's title and category (null for DMs / the fixed room). */
  groupTitle: string | null;
  groupCategory: string | null;
  otherUserId: string | null;
  otherName: string;
  /** The peer's avatar ref (null when unset — render an initial instead). */
  otherAvatar: string | null;
  lastMessage: string | null;
  /** True when the latest message was unsent for everyone. */
  lastMessageUnsent: boolean;
  lastMessageAt: string | null;
  unread: number;
  /** True while I have this chat muted. */
  muted: boolean;
}

/** Mirrors a public.messages row, enriched with the sender's name. */
export interface ChatMessageEntry {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  /** 'chat/…' ref of a photo sent in this message, or null for plain text. */
  image_ref: string | null;
  created_at: string;
  /** The message this one replies to (same conversation), or null. */
  reply_to: string | null;
  /** Set when the sender edited the text. */
  edited_at: string | null;
  /** Set when the sender unsent it for everyone (body and photo are wiped). */
  unsent_at: string | null;
  /** A community post sent in this message, shown as a card. */
  shared_post_id: string | null;
  senderName: string;
  /** Sender's avatar ref; null for realtime inserts (resolved by the screen). */
  senderAvatar: string | null;
}

/**
 * A public group room in the discover list: a conversations row with
 * is_public = true, plus its title, category and current member count.
 */
export interface CommunityRoom {
  id: string;
  title: string;
  category: string;
  createdBy: string | null;
  /** Cloudinary URL of the room's photo, if it has one. */
  iconUrl: string | null;
  /** Preset icon key (see roomIcons.ts); used when there is no photo. */
  iconPreset: string | null;
  memberCount: number;
  /** True when the viewer is already a member (show "Open" vs "Join"). */
  joined: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * The fixed category list shipped with the app. Deliberately a constant rather
 * than a table: it keeps the picker consistent and needs no admin UI. Adding a
 * category is a one-line change here.
 */
export const ROOM_CATEGORIES = [
  "Streetwear",
  "Formal",
  "Casual",
  "Vintage",
  "Thrift",
  "Workwear",
] as const;

export type RoomCategory = (typeof ROOM_CATEGORIES)[number];

/** One person in a conversation, for the settings screen's members list. */
export interface ConversationMember {
  userId: string;
  name: string;
  avatar: string | null;
}

/** What a conversation's settings screen loads. */
export interface ConversationSettings {
  id: string;
  /** True for communities (public rooms and the shared room), false for DMs. */
  isCommunity: boolean;
  title: string | null;
  category: string | null;
  createdBy: string | null;
  chatTheme: string | null;
  mutedUntil: string | null;
  members: ConversationMember[];
  adminIds: string[];
  iconUrl: string | null;
  iconPreset: string | null;
}
