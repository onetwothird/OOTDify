// C:\OOTDify\src\features\community/service.ts
// Data layer for Community: the outfit feed (posts/likes/comments), sharing a
// saved look to the feed, and 1:1 + group chat over Supabase Realtime.
//
// PRIVACY MODEL (enforced by RLS in supabase/schema.sql):
//   * Feed posts/likes/comments are readable by every signed-in user (that is
//     the point of a feed) but only ever WRITTEN by their owner.
//   * Conversation rows and messages are readable only by participants.
//   * Sharing an outfit COPIES image bytes into the public `community` bucket
//     under the sharer's uid. Private buckets (wardrobe/tryons/users) never
//     become cross-user readable — only the explicit copies do. The `avatars`
//     bucket is the one deliberate exception: signed-in users may READ avatar
//     objects so chat and the feed can show real profile photos; writes stay
//     owner-only and anon stays locked out.
//
// Errors are thrown raw (PostgrestError / Error) per the app-wide convention;
// screens surface them through ErrorState/toast.

import { supabase } from "../../shared/lib/supabase";
import { resolveMediaUrl } from "../../shared/lib/storageUrl";
import { uuid } from "../../shared/lib/uuid";
import type {
  ChatMessageEntry,
  CommunityComment,
  CommunityPost,
  ConversationListEntry,
  DirectoryProfile,
  FeedComment,
  FeedPost,
} from "./types";

const currentUserId = async (): Promise<string | null> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
};

/**
 * Fixed UUID of the shared "Community Chat" room. Any signed-in user may join
 * it by inserting their OWN participant row (RLS: user_id = auth.uid()), which
 * is exactly what ensureCommunityRoom() does. The id is deterministic so every
 * client joins the same room.
 */
export const COMMUNITY_ROOM_ID = "4f544444-0000-4000-8000-00000000c0de";

// ---------------------------------------------------------------------------
// Directory (community_directory view — display_name / first_name / avatar)
// ---------------------------------------------------------------------------
async function fetchDirectory(userIds: string[]): Promise<Map<string, DirectoryProfile>> {
  const unique = Array.from(new Set(userIds));
  if (!unique.length) return new Map();
  const { data, error } = await supabase
    .from("community_directory")
    .select("*")
    .in("user_id", unique);
  if (error) throw error;
  const map = new Map<string, DirectoryProfile>();
  for (const row of (data ?? []) as DirectoryProfile[]) {
    map.set(row.user_id, row);
  }
  return map;
}

function authorDisplayName(profile: DirectoryProfile | null | undefined): string {
  return profile?.display_name || profile?.first_name || "OOTDify member";
}

/**
 * Maps raw query errors to a screen-ready message. When the community block of
 * supabase/schema.sql hasn't been applied yet, PostgREST reports a missing
 * table — say so plainly instead of leaking a raw database error.
 */
export function communityErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  const msg = typeof err?.message === "string" ? err.message.toLowerCase() : "";
  const missingTable =
    err?.code === "42P01" ||
    err?.code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table");
  if (missingTable) {
    return "Community isn't set up in your database yet. Apply supabase/schema.sql to your Supabase project, then come back.";
  }
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

/** Display name for one user via the community directory (chat/realtime joins). */
export async function fetchUserDisplayName(userId: string): Promise<string> {
  const directory = await fetchDirectory([userId]);
  return authorDisplayName(directory.get(userId));
}

/**
 * Full directory row (name + avatar) for one user. Chat headers and realtime
 * message rows use it so a peer's real photo can render alongside their name.
 */
export async function fetchUserProfile(userId: string): Promise<DirectoryProfile | null> {
  const directory = await fetchDirectory([userId]);
  return directory.get(userId) ?? null;
}

// ---------------------------------------------------------------------------
// Feed (community_posts + likes)
// ---------------------------------------------------------------------------

/** Latest posts with author info and the viewer's like state, newest first. */
export async function fetchFeed(limit = 50): Promise<FeedPost[]> {
  const uid = await currentUserId();
  const { data: posts, error } = await supabase
    .from("community_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (posts ?? []) as CommunityPost[];
  if (!rows.length) return [];

  const postIds = rows.map((p) => p.id);
  const [directory, likes] = await Promise.all([
    fetchDirectory(rows.map((p) => p.user_id)),
    supabase.from("community_likes").select("post_id").eq("user_id", uid ?? "").in("post_id", postIds),
  ]);
  if (likes.error) throw likes.error;
  const liked = new Set((likes.data ?? []).map((l) => l.post_id as string));

  return rows.map((p) => ({
    ...p,
    author: directory.get(p.user_id) ?? null,
    likedByMe: liked.has(p.id),
  }));
}

/** Like a post. like_count is maintained by a SQL trigger. */
export async function likePost(postId: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase
    .from("community_likes")
    .insert({ post_id: postId, user_id: uid });
  if (error) throw error;
}

/** Remove the viewer's like from a post. */
export async function unlikePost(postId: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase
    .from("community_likes")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", uid);
  if (error) throw error;
}

/** Delete one of the viewer's own posts (cascade removes likes/comments). */
export async function deletePost(post: CommunityPost): Promise<void> {
  const { error } = await supabase.from("community_posts").delete().eq("id", post.id);
  if (error) throw error;
  // Best-effort: drop the copied community images too. The row is already gone;
  // a storage hiccup must not surface as a failed delete.
  const paths = post.image_urls
    .filter((u) => u.startsWith("community/"))
    .map((u) => u.slice("community/".length));
  if (paths.length) {
    try {
      await supabase.storage.from("community").remove(paths);
    } catch {
      /* ignore — the post itself is deleted */
    }
  }
}

// ---------------------------------------------------------------------------
// Comments (community_comments)
// ---------------------------------------------------------------------------
export async function fetchComments(postId: string): Promise<FeedComment[]> {
  const { data, error } = await supabase
    .from("community_comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  const rows = (data ?? []) as CommunityComment[];
  if (!rows.length) return [];
  const directory = await fetchDirectory(rows.map((c) => c.user_id));
  return rows.map((c) => ({
    ...c,
    authorName: authorDisplayName(directory.get(c.user_id)),
  }));
}

export async function addComment(postId: string, body: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Comment cannot be empty");
  const { error } = await supabase
    .from("community_comments")
    .insert({ post_id: postId, user_id: uid, body: trimmed });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Sharing a look to the feed
// ---------------------------------------------------------------------------

/**
 * Resolve an outfit's clothing ids to media refs: catalog rows first (public),
 * then the viewer's own wardrobe items (RLS-scoped to the caller).
 */
async function resolveOutfitImageRefs(clothingIds: string[]): Promise<string[]> {
  const ids = Array.from(new Set(clothingIds));
  if (!ids.length) return [];
  const [catalog, items] = await Promise.all([
    supabase.from("clothing").select("id, thumbnail_url, image_url").in("id", ids),
    supabase.from("clothing_items").select("id, image_url").in("id", ids),
  ]);
  if (catalog.error) throw catalog.error;
  if (items.error) throw items.error;

  const byId = new Map<string, string>();
  for (const row of (catalog.data ?? []) as {
    id: string;
    thumbnail_url: string | null;
    image_url: string;
  }[]) {
    byId.set(row.id, row.thumbnail_url || row.image_url);
  }
  for (const row of (items.data ?? []) as { id: string; image_url: string | null }[]) {
    if (!byId.has(row.id) && row.image_url) byId.set(row.id, row.image_url);
  }
  // Keep the caller's outfit ordering.
  return ids.map((id) => byId.get(id)).filter((r): r is string => Boolean(r));
}

/**
 * Make one media ref publicly readable for the feed:
 *   * http(s) URLs and `clothing/...` catalog refs are already public → kept.
 *   * Private refs (wardrobe/tryons/…) are DOWNLOADED and COPIED into the
 *     public `community` bucket under the sharer's uid.
 * Returns "" when a private image cannot be copied (the share still succeeds
 * with the remaining images rather than failing outright).
 */
async function publicRefForShare(ref: string, uid: string, index: number): Promise<string> {
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  if (ref.startsWith("clothing/")) return ref; // public catalog bucket
  try {
    const signed = await resolveMediaUrl(ref);
    if (!signed) return "";
    const res = await fetch(signed);
    if (!res.ok) return "";
    const blob = await res.blob();
    const path = `${uid}/${Date.now()}-${index}.jpg`;
    const { error } = await supabase.storage
      .from("community")
      .upload(path, blob, { contentType: blob.type || "image/jpeg" });
    if (error) return "";
    return `community/${path}`;
  } catch {
    return "";
  }
}

/**
 * Share a saved look to the community feed. Resolves the outfit's images,
 * copies any private ones into the public community bucket, then inserts the
 * post (image_urls holds the resolved refs).
 */
export async function shareOutfit(input: {
  outfitId?: string | null;
  title?: string | null;
  caption: string;
  clothingIds: string[];
}): Promise<CommunityPost> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");

  const refs = await resolveOutfitImageRefs(input.clothingIds);
  const copied = await Promise.all(refs.map((ref, i) => publicRefForShare(ref, uid, i)));
  const image_urls = copied.filter((r) => r !== "");

  const { data, error } = await supabase
    .from("community_posts")
    .insert({
      user_id: uid,
      saved_outfit_id: input.outfitId ?? null,
      title: input.title?.trim() || null,
      caption: input.caption.trim() || null,
      image_urls,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as CommunityPost;
}

// ---------------------------------------------------------------------------
// Conversations (1:1 DMs + the shared community room)
// ---------------------------------------------------------------------------

/** Create-if-missing + join the shared community room; returns its id. */
export async function ensureCommunityRoom(): Promise<string> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  // Create the room if nobody has yet. A unique violation simply means
  // another user already created it — that's fine, we just join.
  const { error: convErr } = await supabase
    .from("conversations")
    .insert({ id: COMMUNITY_ROOM_ID, created_by: uid });
  if (convErr && convErr.code !== "23505") throw convErr;
  // Insert my own participant row if I'm not in yet (policy: self-join is
  // allowed for the community room only; the creator's own row via creator).
  const { error: partErr } = await supabase
    .from("conversation_participants")
    .upsert(
      { conversation_id: COMMUNITY_ROOM_ID, user_id: uid },
      { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
    );
  if (partErr) throw partErr;
  return COMMUNITY_ROOM_ID;
}

/**
 * Find (or start) a 1:1 conversation with another user. Returns its id.
 * Starting one inserts the conversation first, then MY participant row, then
 * theirs — each statement separately, because RLS WITH CHECK evaluates rows
 * against the statement's snapshot and the creator must be a participant
 * before adding the other person.
 */
export async function startDirectConversation(otherUserId: string): Promise<string> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  if (otherUserId === uid) throw new Error("You can't message yourself");

  const { data: mine, error } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", uid);
  if (error) throw error;
  const myIds = (mine ?? [])
    .map((r) => r.conversation_id as string)
    .filter((id) => id !== COMMUNITY_ROOM_ID);
  if (myIds.length) {
    const { data: shared, error: sErr } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", otherUserId)
      .in("conversation_id", myIds);
    if (sErr) throw sErr;
    const existing = shared?.[0]?.conversation_id as string | undefined;
    if (existing) return existing;
  }

  const conversationId = uuid();
  const { error: cErr } = await supabase
    .from("conversations")
    .insert({ id: conversationId, created_by: uid });
  if (cErr) throw cErr;
  const { error: p1 } = await supabase
    .from("conversation_participants")
    .insert({ conversation_id: conversationId, user_id: uid });
  if (p1) throw p1;
  const { error: p2 } = await supabase
    .from("conversation_participants")
    .insert({ conversation_id: conversationId, user_id: otherUserId });
  if (p2) throw p2;
  return conversationId;
}

/** The viewer's conversations with last message + unread count, most recent first. */
export async function fetchConversations(): Promise<ConversationListEntry[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data: mine, error } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at")
    .eq("user_id", uid);
  if (error) throw error;
  const rows = mine ?? [];
  if (!rows.length) return [];
  const convIds = rows.map((r) => r.conversation_id as string);

  // The other participant(s) of each conversation.
  const { data: others, error: oErr } = await supabase
    .from("conversation_participants")
    .select("conversation_id, user_id")
    .in("conversation_id", convIds)
    .neq("user_id", uid);
  if (oErr) throw oErr;
  const otherByConv = new Map<string, string>();
  for (const r of (others ?? []) as { conversation_id: string; user_id: string }[]) {
    if (!otherByConv.has(r.conversation_id)) otherByConv.set(r.conversation_id, r.user_id);
  }
  const directory = await fetchDirectory(Array.from(otherByConv.values()));

  // Last message + unread count per conversation. N is small (the user's own
  // chats), so a parallel per-conversation query keeps this simple and exact.
  const entries = await Promise.all(
    rows.map(async (row) => {
      const conversationId = row.conversation_id as string;
      const isRoom = conversationId === COMMUNITY_ROOM_ID;
      const otherId = otherByConv.get(conversationId) ?? null;
      const [lastMsg, unread] = await Promise.all([
        supabase
          .from("messages")
          .select("body, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversationId)
          .neq("sender_id", uid)
          .gt("created_at", (row.last_read_at as string | null) ?? "1970-01-01T00:00:00Z"),
      ]);
      if (lastMsg.error) throw lastMsg.error;
      if (unread.error) throw unread.error;
      const other = otherId ? directory.get(otherId) ?? null : null;
      return {
        id: conversationId,
        isRoom,
        otherUserId: otherId,
        otherName: isRoom ? "Community Chat" : authorDisplayName(other),
        otherAvatar: isRoom ? null : other?.avatar_url ?? null,
        lastMessage: (lastMsg.data?.body as string | null) ?? null,
        lastMessageAt: (lastMsg.data?.created_at as string | null) ?? null,
        unread: unread.count ?? 0,
      } satisfies ConversationListEntry;
    }),
  );
  return entries.sort((a, b) =>
    (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Messages of a conversation, oldest first (max 200), with sender names. */
export async function fetchMessages(
  conversationId: string,
  limit = 200,
): Promise<ChatMessageEntry[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as {
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    created_at: string;
  }[];
  if (!rows.length) return [];
  const directory = await fetchDirectory(rows.map((m) => m.sender_id));
  return rows.map((m) => ({
    ...m,
    senderName: authorDisplayName(directory.get(m.sender_id)),
    senderAvatar: directory.get(m.sender_id)?.avatar_url ?? null,
  }));
}

/** Send a message in a conversation the viewer participates in. */
export async function sendMessage(conversationId: string, body: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Message cannot be empty");
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: uid, body: trimmed });
  if (error) throw error;
}

/** Mark a conversation read up to now (owner-only via RLS). */
export async function markConversationRead(conversationId: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const { error } = await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", uid);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Realtime subscriptions
// ---------------------------------------------------------------------------

/** Live new messages in one conversation. Returns an unsubscribe function. */
export function subscribeToMessages(
  conversationId: string,
  onInsert: (message: ChatMessageEntry) => void,
): () => void {
  const channel = supabase
    .channel(`community-messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = payload.new as Omit<ChatMessageEntry, "senderName" | "senderAvatar">;
        // Sender name/avatar resolve lazily — realtime payloads don't carry joins.
        onInsert({ ...row, senderName: "", senderAvatar: null });
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Live feed changes. INSERT/UPDATE carry the new row; DELETE carries only the
 * old row's id (Postgres sends the pre-delete tuple). Returns unsubscribe.
 */
export function subscribeToFeed(
  onChange: (type: "INSERT" | "UPDATE" | "DELETE", post: CommunityPost) => void,
): () => void {
  const channel = supabase
    .channel("community-feed")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "community_posts" },
      (payload) => {
        const type = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
        const row = (type === "DELETE" ? payload.old : payload.new) as CommunityPost;
        onChange(type, row);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
