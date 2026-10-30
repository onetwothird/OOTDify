// Discover's public closet: other people's pieces their owners chose to show,
// hearts and saves on them, and saving someone's look into your own Saved
// looks. RLS decides what is visible; nothing here trusts a client user_id.
import { insertSavedOutfit, type SavedOutfit } from "../clothing/service";
import { authorDisplayName, fetchDirectory } from "../community/service";
import { fetchFriends } from "../community/socialService";
import type { DirectoryProfile, FeedComment, FeedPost } from "../community/types";
import { supabase } from "../../shared/lib/supabase";
import { morePieces, pageOf } from "./paging";
import type { FriendIds, PublicPiece } from "./pieces";

export interface DiscoverPiece extends PublicPiece {
  owner: DirectoryProfile | null;
  likedByMe: boolean;
  savedByMe: boolean;
}

const PIECE_COLUMNS = "id, user_id, name, category, image_url, is_public, like_count, comment_count, created_at";

async function me(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

async function withViewerState(rows: PublicPiece[], uid: string): Promise<DiscoverPiece[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [likes, saves, owners] = await Promise.all([
    supabase.from("piece_likes").select("item_id").eq("user_id", uid).in("item_id", ids),
    supabase.from("saved_pieces").select("item_id").eq("user_id", uid).in("item_id", ids),
    fetchDirectory(rows.map((r) => r.user_id)),
  ]);
  if (likes.error) throw likes.error;
  if (saves.error) throw saves.error;
  const liked = new Set((likes.data ?? []).map((r) => r.item_id as string));
  const saved = new Set((saves.data ?? []).map((r) => r.item_id as string));
  return rows.map((r) => ({
    ...r,
    owner: owners.get(r.user_id) ?? null,
    likedByMe: liked.has(r.id),
    savedByMe: saved.has(r.id),
  }));
}

/** One page of the newest public pieces from everyone else, optionally one category. */
export async function fetchPublicPieces(options: {
  category: string | null;
  shown: number;
  size: number;
}): Promise<{ items: DiscoverPiece[]; hasMore: boolean }> {
  const uid = await me();
  const { from, to } = morePieces(options.shown, options.size);
  let query = supabase
    .from("clothing_items")
    .select(PIECE_COLUMNS)
    .eq("is_public", true)
    .neq("user_id", uid);
  if (options.category) query = query.eq("category", options.category);
  const { data, error } = await query.order("created_at", { ascending: false }).range(from, to);
  if (error) throw error;
  const page = pageOf((data ?? []) as PublicPiece[], options.size);
  return { items: await withViewerState(page.items, uid), hasMore: page.hasMore };
}

/** Pieces I saved that are still public, newest save first. */
export async function fetchSavedPieces(): Promise<DiscoverPiece[]> {
  const uid = await me();
  const { data, error } = await supabase
    .from("saved_pieces")
    .select("item_id, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const order = (data ?? []).map((r) => r.item_id as string);
  if (!order.length) return [];
  const items = await supabase.from("clothing_items").select(PIECE_COLUMNS).in("id", order);
  if (items.error) throw items.error;
  const byId = new Map(((items.data ?? []) as PublicPiece[]).map((p) => [p.id, p]));
  // A piece its owner made private again simply drops out.
  const rows = order.map((id) => byId.get(id)).filter((p): p is PublicPiece => !!p && p.is_public);
  return withViewerState(rows, uid);
}

export async function likePiece(itemId: string): Promise<void> {
  const { error } = await supabase.from("piece_likes").insert({ item_id: itemId, user_id: await me() });
  if (error && error.code !== "23505") throw error;
}

export async function unlikePiece(itemId: string): Promise<void> {
  const { error } = await supabase.from("piece_likes").delete().eq("item_id", itemId).eq("user_id", await me());
  if (error) throw error;
}

export async function savePiece(itemId: string): Promise<void> {
  const { error } = await supabase.from("saved_pieces").insert({ item_id: itemId, user_id: await me() });
  if (error && error.code !== "23505") throw error;
}

export async function unsavePiece(itemId: string): Promise<void> {
  const { error } = await supabase.from("saved_pieces").delete().eq("item_id", itemId).eq("user_id", await me());
  if (error) throw error;
}

/** A comment on a public piece, shaped like a post comment so one thread view shows both. */
export type PieceComment = Omit<FeedComment, "post_id"> & { item_id: string };

/** The oldest-first conversation on one piece (RLS hides it once the piece goes private). */
export async function fetchPieceComments(itemId: string): Promise<PieceComment[]> {
  const { data, error } = await supabase
    .from("piece_comments")
    .select("id, item_id, user_id, body, created_at")
    .eq("item_id", itemId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  const rows = (data ?? []) as Omit<PieceComment, "authorName" | "authorAvatar">[];
  if (!rows.length) return [];
  const directory = await fetchDirectory(rows.map((c) => c.user_id));
  return rows.map((c) => ({
    ...c,
    authorName: authorDisplayName(directory.get(c.user_id)),
    authorAvatar: directory.get(c.user_id)?.avatar_url ?? null,
  }));
}

export async function addPieceComment(itemId: string, body: string): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Comment cannot be empty");
  const { error } = await supabase.from("piece_comments").insert({ item_id: itemId, user_id: await me(), body: trimmed });
  if (error) throw error;
}

/** Deletes a piece comment: my own, or anyone's on my piece (RLS decides). */
export async function deletePieceComment(commentId: string): Promise<void> {
  const { data, error } = await supabase.from("piece_comments").delete().eq("id", commentId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Comment not deleted");
}

/** Saves someone's look into my Saved looks, remembering whose it was. */
export async function saveLook(look: FeedPost): Promise<SavedOutfit> {
  return insertSavedOutfit({
    name: look.title,
    clothing_ids: [],
    result_url: look.image_urls[0] ?? null,
    source_post_id: look.id,
    source_user_id: look.user_id,
  });
}

/** Looks I saved from Discover posts: post id to saved outfit id. */
export async function fetchSavedLookIds(): Promise<Map<string, string>> {
  const uid = await me();
  const { data, error } = await supabase
    .from("saved_outfits")
    .select("id, source_post_id")
    .eq("user_id", uid)
    .not("source_post_id", "is", null);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.source_post_id as string, r.id as string]));
}

/** Friend ids for the add-friend buttons. */
export async function fetchFriendIds(): Promise<FriendIds> {
  const o = await fetchFriends();
  return {
    me: o.me,
    friends: o.friends.map((p) => p.user_id),
    incoming: o.incoming.map((p) => p.user_id),
    outgoing: o.outgoing.map((p) => p.user_id),
  };
}
