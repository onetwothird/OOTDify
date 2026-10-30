// Looks your friends shared on Discover lately, for Penggi to announce on
// Home. Same rule as Discover (outfitLooks): a post shared from a saved
// outfit, with a photo. RLS decides which posts are readable.
import { supabase } from "../../shared/lib/supabase";
import { displayName, fetchFriends } from "../community/socialService";
import type { FriendLook } from "./penggiLines";

/** Only looks this fresh are news. */
const FRESH_MS = 48 * 60 * 60 * 1000;
const MAX_LOOKS = 3;

export async function fetchFriendLooks(): Promise<FriendLook[]> {
  const { friends } = await fetchFriends();
  if (!friends.length) return [];
  const byId = new Map(friends.map((f) => [f.user_id, f]));
  const { data, error } = await supabase
    .from("community_posts")
    .select("id, user_id, created_at, image_urls")
    .in("user_id", [...byId.keys()])
    .not("saved_outfit_id", "is", null)
    .gte("created_at", new Date(Date.now() - FRESH_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(MAX_LOOKS);
  if (error) throw error;
  return ((data ?? []) as { id: string; user_id: string; created_at: string; image_urls: string[] | null }[])
    .filter((p) => (p.image_urls?.length ?? 0) > 0)
    .map((p) => ({ postId: p.id, userId: p.user_id, name: displayName(byId.get(p.user_id)), at: p.created_at }));
}
