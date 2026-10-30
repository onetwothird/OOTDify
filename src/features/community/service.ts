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

import type { RealtimeChannel } from "@supabase/supabase-js";
import { formFile } from "../../shared/lib/formFile";
import { shrinkForUpload } from "../../shared/lib/shrinkImage";
import { supabase } from "../../shared/lib/supabase";
import { realtimeTopic } from "../../shared/lib/realtimeTopic";
import { sharedSubscriptions } from "../../shared/lib/sharedSubscription";
import { resolveMediaUrl } from "../../shared/lib/storageUrl";
import { uuid } from "../../shared/lib/uuid";
import { chatPhotoPath, chatPhotoRef, photoMessageBody } from "./chatMedia";
import { isMuted } from "./chatSettings";
import type { ReactionRow } from "./chatThread";
import { reshareTarget, sharedPostBody, visiblePosts } from "./postShare";
import { cleanRoomTitle } from "./roomIcons";
import type {
  ChatMessageEntry,
  CommunityComment,
  CommunityPost,
  CommunityRoom,
  ConversationListEntry,
  ConversationMember,
  ConversationSettings,
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
export async function fetchDirectory(userIds: string[]): Promise<Map<string, DirectoryProfile>> {
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
  return profile?.display_name || profile?.first_name || "Penggi member";
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
  // 42501 = insufficient_privilege: the write was refused by a row-level
  // security policy. The app only ever writes rows it owns, so this means the
  // project's policies are missing or out of date rather than the user doing
  // anything wrong — say that instead of leaking the raw Postgres text.
  // A guard trigger also uses 42501, with a sentence written for the user
  // ("Only a community admin can change its theme"); show that one as is.
  const policyDenied =
    msg.includes("row-level security policy") ||
    msg.includes("permission denied") ||
    (err?.code === "42501" && !msg);
  if (policyDenied) {
    return "This project's community permissions are out of date. Apply supabase/schema.sql to your Supabase project, then try again.";
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

/** A community_posts row with the columns added after launch defaulted. */
function postRow(p: CommunityPost): CommunityPost {
  return { ...p, reshared_from: p.reshared_from ?? null, reshare_count: p.reshare_count ?? 0 };
}

/**
 * Add authors and my like/save state to post rows. Reshares also get the
 * post they reshare (one level: an original never carries another).
 */
async function enrichPosts(rows: CommunityPost[], withOriginals = true): Promise<FeedPost[]> {
  if (!rows.length) return [];
  const uid = await currentUserId();
  const postIds = rows.map((p) => p.id);
  const originalIds = withOriginals
    ? [...new Set(rows.map((p) => p.reshared_from).filter((id): id is string => id !== null))]
    : [];
  const [directory, likes, saves, originals] = await Promise.all([
    fetchDirectory(rows.map((p) => p.user_id)),
    supabase.from("community_likes").select("post_id").eq("user_id", uid ?? "").in("post_id", postIds),
    supabase.from("saved_posts").select("post_id").eq("user_id", uid ?? "").in("post_id", postIds),
    originalIds.length ? fetchPostsByIds(originalIds, false) : Promise.resolve(new Map<string, FeedPost>()),
  ]);
  if (likes.error) throw likes.error;
  if (saves.error) throw saves.error;
  const liked = new Set((likes.data ?? []).map((l) => l.post_id as string));
  const saved = new Set((saves.data ?? []).map((s) => s.post_id as string));

  return rows.map((p) => ({
    ...p,
    author: directory.get(p.user_id) ?? null,
    likedByMe: liked.has(p.id),
    savedByMe: saved.has(p.id),
    original: p.reshared_from ? originals.get(p.reshared_from) ?? null : null,
  }));
}

/** Posts by id, enriched (for chat cards, a single post, saved posts). Missing ids are absent. */
export async function fetchPostsByIds(ids: string[], withOriginals = true): Promise<Map<string, FeedPost>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from("community_posts").select("*").in("id", ids);
  if (error) throw error;
  const posts = await enrichPosts(((data ?? []) as CommunityPost[]).map(postRow), withOriginals);
  return new Map(posts.map((p) => [p.id, p]));
}

/** Latest posts with author info and my like/save state, newest first, minus posts I hid. */
export async function fetchFeed(limit = 50): Promise<FeedPost[]> {
  const uid = await currentUserId();
  const [{ data: posts, error }, hidden] = await Promise.all([
    supabase.from("community_posts").select("*").order("created_at", { ascending: false }).limit(limit),
    supabase.from("hidden_posts").select("post_id").eq("user_id", uid ?? ""),
  ]);
  if (error) throw error;
  if (hidden.error) throw hidden.error;
  const hiddenIds = new Set((hidden.data ?? []).map((h) => h.post_id as string));
  const rows = visiblePosts(((posts ?? []) as CommunityPost[]).map(postRow), hiddenIds);
  return enrichPosts(rows);
}

/** One post, or null when it was deleted. */
export async function fetchPost(postId: string): Promise<FeedPost | null> {
  return (await fetchPostsByIds([postId])).get(postId) ?? null;
}

/** Posts I saved, most recently saved first. */
export async function fetchSavedPosts(): Promise<FeedPost[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("saved_posts")
    .select("post_id")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const ids = (data ?? []).map((s) => s.post_id as string);
  const byId = await fetchPostsByIds(ids);
  return ids.map((id) => byId.get(id)).filter((p): p is FeedPost => p !== undefined);
}

/** Reshare a post to the feed with my own caption. The database points it at the original. */
export async function resharePost(post: { id: string; reshared_from: string | null }, caption: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase.from("community_posts").insert({
    user_id: uid,
    caption: caption.trim() || null,
    image_urls: [],
    reshared_from: reshareTarget(post),
  });
  if (error) throw error;
}

export async function savePost(postId: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase.from("saved_posts").insert({ user_id: uid, post_id: postId });
  if (error && error.code !== "23505") throw error;
}

export async function unsavePost(postId: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase.from("saved_posts").delete().eq("user_id", uid).eq("post_id", postId);
  if (error) throw error;
}

/** Hide a post from my feed only. */
export async function hidePost(postId: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase.from("hidden_posts").insert({ user_id: uid, post_id: postId });
  if (error && error.code !== "23505") throw error;
}

/** Send a post to friends: into each one's DM, as a card, with an optional note. */
export async function sendPostToFriends(postId: string, friendIds: string[], note: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  for (const friendId of friendIds) {
    const conversationId = await startDirectConversation(friendId);
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: uid,
      body: sharedPostBody(note),
      shared_post_id: postId,
    });
    if (error) throw error;
  }
}

/** The signed-in user's own posts, newest first (for their profile page). */
export async function fetchMyPosts(limit = 30): Promise<CommunityPost[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("community_posts")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CommunityPost[];
}

/** Another member's posts (posts are public to every signed-in member). */
export async function fetchUserPosts(userId: string, limit = 30): Promise<CommunityPost[]> {
  const { data, error } = await supabase
    .from("community_posts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CommunityPost[];
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
    authorAvatar: directory.get(c.user_id)?.avatar_url ?? null,
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
    const path = `${uid}/${Date.now()}-${index}.jpg`;
    // `signed` is a remote URL; formFile only reads local files, so copy the
    // bytes across.
    const res = await fetch(signed);
    if (!res.ok) return "";
    const { error } = await supabase.storage
      .from("community")
      .upload(path, await res.arrayBuffer(), { contentType: "image/jpeg" });
    if (error) return "";
    return `community/${path}`;
  } catch {
    return "";
  }
}

/**
 * Upload a photo picked on this device to the public community bucket, under
 * the poster's uid. Unlike an outfit's copied images, a photo the user chose
 * themselves must not vanish quietly, so a failed upload fails the post.
 */
async function uploadPostPhoto(uri: string, uid: string, index: number): Promise<string> {
  const small = await shrinkForUpload(uri);
  const path = `${uid}/${Date.now()}-photo-${index}.jpg`;
  const { error } = await supabase.storage
    .from("community")
    .upload(path, formFile(small), {
      contentType: "image/jpeg",
    });
  if (error) throw error;
  return `community/${path}`;
}

/**
 * Post to the community feed: a caption, photos from the device, a saved
 * outfit, or any mix. The outfit is optional; its images are resolved and any
 * private ones copied into the public community bucket. Device photos come
 * first in image_urls.
 */
export async function shareOutfit(input: {
  outfitId?: string | null;
  title?: string | null;
  caption: string;
  clothingIds?: string[];
  photoUris?: string[];
}): Promise<CommunityPost> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");

  const photos = await Promise.all((input.photoUris ?? []).map((uri, i) => uploadPostPhoto(uri, uid, i)));
  const refs = await resolveOutfitImageRefs(input.clothingIds ?? []);
  const copied = await Promise.all(refs.map((ref, i) => publicRefForShare(ref, uid, i)));
  const image_urls = [...photos, ...copied.filter((r) => r !== "")];
  if (!image_urls.length && !input.caption.trim()) {
    throw new Error("Add a caption, a photo or an outfit to post.");
  }

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
  // Join with a PLAIN insert, exactly like startDirectConversation does — no
  // upsert. `ON CONFLICT` upserts additionally require the UPDATE policy to be
  // satisfiable, and a join is not an update. A 23505 unique violation simply
  // means I'm already in the room, which is success.
  const { error: partErr } = await supabase
    .from("conversation_participants")
    .insert({ conversation_id: COMMUNITY_ROOM_ID, user_id: uid });
  if (partErr && partErr.code !== "23505") throw partErr;
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
    // You and a friend can both be in the same public room; only a private
    // chat counts, otherwise Message would open that room instead.
    const sharedIds = (shared ?? []).map((r) => r.conversation_id as string);
    if (sharedIds.length) {
      const { data: privateOnes, error: pErr } = await supabase
        .from("conversations")
        .select("id")
        .in("id", sharedIds)
        .eq("is_public", false)
        .limit(1);
      if (pErr) throw pErr;
      const existing = privateOnes?.[0]?.id as string | undefined;
      if (existing) return existing;
    }
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
  if (p2) {
    // The database only lets a chat start with an accepted friend. Undo the
    // empty chat so a refused attempt leaves nothing behind.
    await supabase.from("conversations").delete().eq("id", conversationId);
    if (p2.code === "42501") throw new Error("You can only message friends. Send a friend request first.");
    throw p2;
  }
  return conversationId;
}

// ---------------------------------------------------------------------------
// Public group rooms (user-created communities)
// ---------------------------------------------------------------------------

/**
 * Create a public group room and join it. Returns the new room's id.
 *
 * The conversation row is inserted first (is_public = true so everyone can
 * discover it), then MY participant row — two statements, because the room must
 * exist before its participant row can reference it, and RLS evaluates each
 * statement independently.
 */
export async function createRoom(input: {
  title: string;
  category: string;
  /** A preset icon key; a photo is uploaded separately once the room exists. */
  iconPreset?: string | null;
}): Promise<string> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const cleaned = cleanRoomTitle(input.title);
  if (!cleaned.ok) throw new Error(cleaned.error);
  const title = cleaned.title;

  const roomId = uuid();
  const { error: cErr } = await supabase.from("conversations").insert({
    id: roomId,
    created_by: uid,
    title,
    category: input.category,
    icon_preset: input.iconPreset ?? null,
    is_public: true,
  });
  if (cErr) throw cErr;

  const { error: pErr } = await supabase
    .from("conversation_participants")
    .insert({ conversation_id: roomId, user_id: uid });
  if (pErr) throw pErr;
  return roomId;
}

/**
 * Public rooms for the discover list, newest activity first, each with its
 * member count and whether the viewer has already joined.
 */
export async function fetchPublicRooms(): Promise<CommunityRoom[]> {
  const uid = await currentUserId();
  if (!uid) return [];

  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, category, created_by, icon_url, icon_preset, created_at, updated_at")
    .eq("is_public", true)
    .not("title", "is", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const rooms = (data ?? []) as {
    id: string;
    title: string | null;
    category: string | null;
    created_by: string | null;
    icon_url: string | null;
    icon_preset: string | null;
    created_at: string;
    updated_at: string;
  }[];
  if (!rooms.length) return [];

  const roomIds = rooms.map((r) => r.id);
  // Member counts and my own memberships. N is bounded (rooms are capped above),
  // so two set-based queries beat a per-room round trip.
  const [counts, mine] = await Promise.all([
    supabase
      .from("conversation_participants")
      .select("conversation_id")
      .in("conversation_id", roomIds),
    supabase
      .from("conversation_participants")
      .select("conversation_id")
      .in("conversation_id", roomIds)
      .eq("user_id", uid),
  ]);
  if (counts.error) throw counts.error;
  if (mine.error) throw mine.error;

  const countByRoom = new Map<string, number>();
  for (const r of (counts.data ?? []) as { conversation_id: string }[]) {
    countByRoom.set(r.conversation_id, (countByRoom.get(r.conversation_id) ?? 0) + 1);
  }
  const joined = new Set(
    ((mine.data ?? []) as { conversation_id: string }[]).map((r) => r.conversation_id),
  );

  return rooms.map((r) => ({
    id: r.id,
    title: r.title ?? "Untitled community",
    category: r.category ?? "Casual",
    createdBy: r.created_by,
    iconUrl: r.icon_url,
    iconPreset: r.icon_preset,
    memberCount: countByRoom.get(r.id) ?? 0,
    joined: joined.has(r.id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** Join a public room (idempotent — already being a member is success). */
export async function joinRoom(roomId: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase
    .from("conversation_participants")
    .insert({ conversation_id: roomId, user_id: uid });
  // 23505 = already a member, which is the desired end state anyway.
  if (error && error.code !== "23505") throw error;
}

/** Room metadata for the chat header, or null for a DM. */
export async function fetchRoomMeta(roomId: string): Promise<{
  title: string | null;
  category: string | null;
  isPublic: boolean;
  createdBy: string | null;
  /** True when I may rename the room and change its icon (its creator or a listed admin). */
  canEdit: boolean;
  iconUrl: string | null;
  iconPreset: string | null;
} | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("title, category, is_public, created_by, icon_url, icon_preset")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as {
    title: string | null;
    category: string | null;
    is_public: boolean;
    created_by: string | null;
    icon_url: string | null;
    icon_preset: string | null;
  };
  const uid = await currentUserId();
  let canEdit = Boolean(uid) && row.created_by === uid;
  if (uid && !canEdit) {
    // I can only read my own rows, so any row here means I am an admin.
    const { data: admin } = await supabase
      .from("conversation_admins")
      .select("user_id")
      .eq("conversation_id", roomId)
      .eq("user_id", uid)
      .maybeSingle();
    canEdit = Boolean(admin);
  }
  return {
    title: row.title,
    category: row.category,
    isPublic: row.is_public,
    createdBy: row.created_by,
    canEdit,
    iconUrl: row.icon_url,
    iconPreset: row.icon_preset,
  };
}

/**
 * Rename a room. A database trigger lets only the room's creator (its admin)
 * do this.
 */
export async function renameRoom(roomId: string, rawTitle: string): Promise<string> {
  const cleaned = cleanRoomTitle(rawTitle);
  if (!cleaned.ok) throw new Error(cleaned.error);
  const { error } = await supabase.from("conversations").update({ title: cleaned.title }).eq("id", roomId);
  if (error) throw error;
  return cleaned.title;
}

/**
 * Switch a room to a preset icon, or to its initials with null. Clears any
 * photo. A database trigger lets only the room's creator do this; photos go
 * through uploadRoomIcon (backend) instead.
 */
export async function setRoomIconPreset(roomId: string, preset: string | null): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ icon_preset: preset, icon_url: null })
    .eq("id", roomId);
  if (error) throw error;
}

/** The viewer's conversations with last message + unread count, most recent first. */
export async function fetchConversations(): Promise<ConversationListEntry[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data: mine, error } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at, muted_until")
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

  // Which of these are public GROUP ROOMS? They are excluded from the DM list
  // (the screen renders them under Communities) and named by their title rather
  // than by "the other participant", which for a group is meaningless.
  const { data: groupRows, error: gErr } = await supabase
    .from("conversations")
    .select("id, title, category")
    .in("id", convIds)
    .eq("is_public", true);
  if (gErr) throw gErr;
  const groupByConv = new Map<string, { title: string; category: string | null }>();
  for (const g of (groupRows ?? []) as {
    id: string;
    title: string | null;
    category: string | null;
  }[]) {
    groupByConv.set(g.id, { title: g.title ?? "Untitled community", category: g.category });
  }

  // Last message + unread count per conversation. N is small (the user's own
  // chats), so a parallel per-conversation query keeps this simple and exact.
  const entries = await Promise.all(
    rows.map(async (row) => {
      const conversationId = row.conversation_id as string;
      const isRoom = conversationId === COMMUNITY_ROOM_ID;
      const group = groupByConv.get(conversationId) ?? null;
      const otherId = otherByConv.get(conversationId) ?? null;
      const [lastMsg, unread] = await Promise.all([
        supabase
          .from("messages")
          .select("body, created_at, unsent_at")
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
      // Name precedence: the fixed room, then a group room's title, then the
      // peer's display name for a 1:1.
      const displayName = isRoom
        ? "Community Chat"
        : group
          ? group.title
          : authorDisplayName(other);
      return {
        id: conversationId,
        isRoom,
        isGroup: group !== null,
        groupTitle: group?.title ?? null,
        groupCategory: group?.category ?? null,
        otherUserId: otherId,
        otherName: displayName,
        otherAvatar: isRoom || group ? null : other?.avatar_url ?? null,
        lastMessage: (lastMsg.data?.body as string | null) ?? null,
        lastMessageUnsent: Boolean(lastMsg.data?.unsent_at),
        lastMessageAt: (lastMsg.data?.created_at as string | null) ?? null,
        unread: unread.count ?? 0,
        muted: isMuted((row.muted_until as string | null) ?? null, Date.now()),
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

type MessageRow = Omit<ChatMessageEntry, "senderName" | "senderAvatar">;

/** A raw messages row with every optional column defaulted. */
function messageRow(m: MessageRow): MessageRow {
  return {
    ...m,
    image_ref: m.image_ref ?? null,
    reply_to: m.reply_to ?? null,
    edited_at: m.edited_at ?? null,
    unsent_at: m.unsent_at ?? null,
    shared_post_id: m.shared_post_id ?? null,
  };
}

/**
 * Messages of a conversation, oldest first (max 200), with sender names.
 * Messages I removed for myself are left out.
 */
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
  const all = ((data ?? []) as MessageRow[]).map(messageRow);
  if (!all.length) return [];
  const { data: hidden, error: hErr } = await supabase
    .from("message_hidden")
    .select("message_id")
    .in("message_id", all.map((m) => m.id));
  if (hErr) throw hErr;
  const hiddenIds = new Set((hidden ?? []).map((h) => h.message_id as string));
  const rows = all.filter((m) => !hiddenIds.has(m.id));
  if (!rows.length) return [];
  const directory = await fetchDirectory(rows.map((m) => m.sender_id));
  return rows.map((m) => ({
    ...m,
    senderName: authorDisplayName(directory.get(m.sender_id)),
    senderAvatar: directory.get(m.sender_id)?.avatar_url ?? null,
  }));
}

/** Send a message in a conversation the viewer participates in, optionally as a reply. */
export async function sendMessage(conversationId: string, body: string, replyTo: string | null = null): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Message cannot be empty");
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: uid, body: trimmed, reply_to: replyTo });
  if (error) throw error;
}

/**
 * Send a photo (with an optional caption) in a conversation. The photo is
 * shrunk, uploaded to the private chat bucket, then the message points at it;
 * if the message is refused the upload is removed so nothing is left behind.
 */
export async function sendPhotoMessage(
  conversationId: string,
  photoUri: string,
  caption = "",
  replyTo: string | null = null,
): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const small = await shrinkForUpload(photoUri);
  const path = chatPhotoPath(conversationId, uid, uuid());
  const { error: uploadError } = await supabase.storage
    .from("chat")
    .upload(path, formFile(small), { contentType: "image/jpeg" });
  if (uploadError) throw uploadError;
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: uid,
    body: photoMessageBody(caption),
    image_ref: chatPhotoRef(path),
    reply_to: replyTo,
  });
  if (error) {
    await supabase.storage.from("chat").remove([path]);
    throw error;
  }
}

/** Edit my own text message (a database trigger enforces the 15 minute window). */
export async function editMessage(messageId: string, body: string): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Message cannot be empty");
  const { error } = await supabase.from("messages").update({ body: trimmed }).eq("id", messageId);
  if (error) throw error;
}

/**
 * Unsend my message for everyone. The database wipes its text and photo
 * reference; the photo file itself is then removed from storage.
 */
export async function unsendMessage(message: { id: string; image_ref: string | null }): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ unsent_at: new Date().toISOString() })
    .eq("id", message.id);
  if (error) throw error;
  if (message.image_ref?.startsWith("chat/")) {
    // Best effort: the message no longer points at the file either way.
    await supabase.storage.from("chat").remove([message.image_ref.slice("chat/".length)]);
  }
}

/** Remove a message from my view of the chat only. */
export async function hideMessage(messageId: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase.from("message_hidden").insert({ message_id: messageId, user_id: uid });
  if (error && error.code !== "23505") throw error;
}

/** Every live reaction in a conversation (removed ones have a null emoji and are skipped). */
export async function fetchReactions(conversationId: string): Promise<ReactionRow[]> {
  const { data, error } = await supabase
    .from("message_reactions")
    .select("message_id, user_id, emoji, created_at")
    .eq("conversation_id", conversationId)
    .not("emoji", "is", null);
  if (error) throw error;
  return (data ?? []) as ReactionRow[];
}

/** Set my reaction on a message, or clear it with null. */
export async function setReaction(messageId: string, emoji: string | null): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase
    .from("message_reactions")
    .upsert({ message_id: messageId, user_id: uid, emoji }, { onConflict: "message_id,user_id" });
  if (error) throw error;
}

/** Live reaction changes in one conversation. Returns an unsubscribe function. */
export function subscribeToReactions(conversationId: string, onChange: (row: ReactionRow) => void): () => void {
  const channel = supabase
    .channel(realtimeTopic(`community-reactions:${conversationId}`))
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        // Removing a reaction is an UPDATE to a null emoji, so DELETE never matters here.
        if (payload.eventType === "DELETE") return;
        const row = payload.new as ReactionRow;
        onChange({ message_id: row.message_id, user_id: row.user_id, emoji: row.emoji, created_at: row.created_at });
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Conversation settings
// ---------------------------------------------------------------------------

/** Everything the settings screen shows for one conversation. */
export async function fetchConversationSettings(conversationId: string): Promise<ConversationSettings> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const [conv, people, admins] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, title, category, is_public, created_by, chat_theme, icon_url, icon_preset")
      .eq("id", conversationId)
      .single(),
    supabase.from("conversation_participants").select("user_id, muted_until").eq("conversation_id", conversationId),
    supabase.from("conversation_admins").select("user_id").eq("conversation_id", conversationId),
  ]);
  if (conv.error) throw conv.error;
  if (people.error) throw people.error;
  if (admins.error) throw admins.error;
  const row = conv.data as {
    id: string;
    title: string | null;
    category: string | null;
    is_public: boolean;
    created_by: string | null;
    chat_theme: string | null;
    icon_url: string | null;
    icon_preset: string | null;
  };
  const participants = (people.data ?? []) as { user_id: string; muted_until: string | null }[];
  const directory = await fetchDirectory(participants.map((p) => p.user_id));
  const members: ConversationMember[] = participants.map((p) => ({
    userId: p.user_id,
    name: authorDisplayName(directory.get(p.user_id)),
    avatar: directory.get(p.user_id)?.avatar_url ?? null,
  }));
  return {
    id: row.id,
    isCommunity: row.id === COMMUNITY_ROOM_ID || row.is_public || row.title !== null,
    title: row.title,
    category: row.category,
    createdBy: row.created_by,
    chatTheme: row.chat_theme,
    mutedUntil: participants.find((p) => p.user_id === uid)?.muted_until ?? null,
    members,
    adminIds: (admins.data ?? []).map((a) => a.user_id as string),
    iconUrl: row.icon_url,
    iconPreset: row.icon_preset,
  };
}

/** Just the theme key, for the chat screen. */
export async function fetchChatTheme(conversationId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("chat_theme")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  return (data?.chat_theme as string | null) ?? null;
}

/** The conversation's shared theme (communities: admins only, enforced by a trigger). */
export async function setChatTheme(conversationId: string, theme: string | null): Promise<void> {
  const { data, error } = await supabase
    .from("conversations")
    .update({ chat_theme: theme })
    .eq("id", conversationId)
    .select("id");
  if (error) throw error;
  // RLS silently filters an update it doesn't allow, so check it landed.
  if (!data || data.length === 0) throw new Error("You can't change this chat's theme.");
  await announceChatTheme(conversationId);
}

// Theme changes are announced on a broadcast topic both people share, so an
// open thread repaints without waiting to be reopened. Listeners re-read the
// theme from the database; the broadcast itself carries nothing to trust.
const THEME_EVENT = "theme";
const themeTopic = (conversationId: string) => `chat-theme:${conversationId}`;
// A channel being removed still answers to its topic until unsubscribe
// resolves, so a reopen waits for that first.
const closingTopics = new Map<string, Promise<unknown>>();

const themeChannels = sharedSubscriptions((topic, emit) => {
  let channel: RealtimeChannel | null = null;
  let closed = false;
  void (closingTopics.get(topic) ?? Promise.resolve()).then(() => {
    if (closed) return;
    channel = supabase
      .channel(topic)
      .on("broadcast", { event: THEME_EVENT }, () => emit(null))
      .subscribe();
  });
  return () => {
    closed = true;
    if (!channel) return;
    const done = supabase.removeChannel(channel).finally(() => {
      if (closingTopics.get(topic) === done) closingTopics.delete(topic);
    });
    closingTopics.set(topic, done);
  };
});

/** Calls onChange whenever someone changes this conversation's theme. Returns unsubscribe. */
export function subscribeToChatTheme(conversationId: string, onChange: () => void): () => void {
  return themeChannels.listen(themeTopic(conversationId), onChange);
}

/** Tells everyone with the thread open that the theme changed. Best effort: they also re-read it on focus. */
async function announceChatTheme(conversationId: string): Promise<void> {
  const topic = themeTopic(conversationId);
  // Reuse the thread's own channel when it's open; otherwise borrow one and drop it after.
  const borrowed = !supabase.getChannels().some((c) => c.topic === `realtime:${topic}`);
  const channel = supabase.channel(topic);
  try {
    await channel.httpSend(THEME_EVENT, { at: Date.now() });
  } catch {
    // Realtime being down must not fail the theme change itself.
  } finally {
    if (borrowed) void supabase.removeChannel(channel);
  }
}

/** Mute message notifications until a time, or unmute with null. */
export async function setConversationMuted(conversationId: string, until: string | null): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase
    .from("conversation_participants")
    .update({ muted_until: until })
    .eq("conversation_id", conversationId)
    .eq("user_id", uid);
  if (error) throw error;
}

/** Remove someone from a community (admins; never the creator). */
export async function removeMember(conversationId: string, userId: string): Promise<void> {
  const { error, count } = await supabase
    .from("conversation_participants")
    .delete({ count: "exact" })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;
  if (!count) throw new Error("You can't remove this member");
}

/** Grant or revoke admin (the community's creator only). */
export async function setRoomAdmin(conversationId: string, userId: string, admin: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_room_admin", {
    p_conversation: conversationId,
    p_user: userId,
    p_admin: admin,
  });
  if (error) throw error;
}

/** Leave a conversation. */
export async function leaveConversation(conversationId: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase
    .from("conversation_participants")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", uid);
  if (error) throw error;
}

/** Delete a community I created, with all its messages. */
export async function deleteConversation(conversationId: string): Promise<void> {
  const { error, count } = await supabase
    .from("conversations")
    .delete({ count: "exact" })
    .eq("id", conversationId);
  if (error) throw error;
  if (!count) throw new Error("Only the creator can delete this community");
}

/** Photos shared in a conversation, newest first (unsent ones no longer have one). */
export async function fetchChatPhotos(conversationId: string, limit = 60): Promise<{ id: string; image_ref: string }[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, image_ref")
    .eq("conversation_id", conversationId)
    .not("image_ref", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as { id: string; image_ref: string }[];
}

/** When each participant last read this conversation (participants can see each other's). */
export async function fetchReadState(conversationId: string): Promise<Map<string, string | null>> {
  const { data, error } = await supabase
    .from("conversation_participants")
    .select("user_id, last_read_at")
    .eq("conversation_id", conversationId);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.user_id as string, (r.last_read_at as string | null) ?? null]));
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

/**
 * Live messages in one conversation: new ones, and edits/unsends of existing
 * ones (onUpdate). Returns an unsubscribe function.
 */
export function subscribeToMessages(
  conversationId: string,
  onInsert: (message: ChatMessageEntry) => void,
  onUpdate?: (message: MessageRow) => void,
): () => void {
  const channel = supabase
    .channel(realtimeTopic(`community-messages:${conversationId}`))
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = messageRow(payload.new as MessageRow);
        // Sender name/avatar resolve lazily — realtime payloads don't carry joins.
        onInsert({ ...row, senderName: "", senderAvatar: null });
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onUpdate?.(messageRow(payload.new as MessageRow)),
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
    .channel(realtimeTopic("community-feed"))
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
