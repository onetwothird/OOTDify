// Everything the profile page shows, loaded together, and the cache that
// lets the page open instantly (profileCache.ts). The tabs preload it once
// shortly after launch, so the first visit to Profile is already filled in.
import { getProfile, type UserProfile } from "../../services/aiApi";
import { supabase } from "../../shared/lib/supabase";
import { fetchMyCloset, fetchSavedOutfits, type SavedOutfit } from "../clothing/service";
import type { ClothingItem } from "../clothing/types";
import { fetchMyPosts } from "../community/service";
import type { CommunityPost } from "../community/types";
import { readProfileCache, writeProfileCache } from "./profileCache";

export interface ProfilePageData {
  profile: UserProfile;
  email: string | null;
  joined: string | null;
  closet: ClothingItem[];
  looks: SavedOutfit[];
  posts: CommunityPost[];
}

/** The last load for the signed-in account, or null. */
export async function cachedProfilePage(): Promise<ProfilePageData | null> {
  const { data } = await supabase.auth.getSession();
  return readProfileCache<ProfilePageData>(data.session?.user?.id ?? null);
}

/** Loads the page fresh and remembers it for the next visit. */
export async function loadProfilePage(): Promise<ProfilePageData> {
  const [{ profile, email }, user, closet, looks, posts] = await Promise.all([
    getProfile(),
    supabase.auth.getUser(),
    fetchMyCloset(),
    fetchSavedOutfits(),
    fetchMyPosts(),
  ]);
  const data: ProfilePageData = {
    profile,
    email,
    joined: user.data.user?.created_at ?? null,
    closet,
    looks,
    posts,
  };
  const userId = user.data.user?.id;
  if (userId) writeProfileCache(userId, data);
  return data;
}
