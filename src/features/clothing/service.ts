// C:\OOTDify\src\features\clothing\service.ts
// Read/write access to the shared catalog + the user's own favorites and
// recently-viewed history, through the Supabase anon client. RLS enforces
// that favorites/recently_viewed rows can only be touched by their owner;
// the catalog itself is readable by any authenticated user.

import { supabase } from "../../shared/lib/supabase";
import { CatalogItem, ClothingItem, FavoriteRow } from "./types";

export { uuid } from "../../shared/lib/uuid";

export const currentUserId = async (): Promise<string | null> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
};

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
export async function fetchCatalog(options: {
  category?: string;
  limit?: number;
} = {}): Promise<CatalogItem[]> {
  let query = supabase
    .from("clothing")
    .select("*")
    .order("created_at", { ascending: true });
  if (options.category) query = query.eq("category", options.category);
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CatalogItem[];
}

export async function fetchCatalogItem(id: string): Promise<CatalogItem | null> {
  const { data, error } = await supabase
    .from("clothing")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as CatalogItem | null) ?? null;
}

// ---------------------------------------------------------------------------
// Favorites (owner-only via RLS)
// ---------------------------------------------------------------------------
export async function fetchFavoriteIds(): Promise<Set<string>> {
  const uid = await currentUserId();
  if (!uid) return new Set();
  const { data, error } = await supabase
    .from("favorites")
    .select("target_type, target_id")
    .eq("target_type", "clothing");
  if (error) throw error;
  return new Set((data ?? []).map((f) => f.target_id as string));
}

export async function addFavorite(clothingId: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase
    .from("favorites")
    .insert({ user_id: uid, target_type: "clothing", target_id: clothingId });
  if (error) throw error;
}

export async function removeFavorite(clothingId: string): Promise<void> {
  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("target_type", "clothing")
    .eq("target_id", clothingId);
  if (error) throw error;
}

/** Favorited catalog items, hydrated (join done client-side). */
export async function fetchFavoriteItems(): Promise<CatalogItem[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data: favs, error } = await supabase
    .from("favorites")
    .select("target_id, created_at")
    .eq("target_type", "clothing")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const ids = (favs ?? []).map((f) => f.target_id as string);
  if (!ids.length) return [];
  const { data: items, error: itemsError } = await supabase
    .from("clothing")
    .select("*")
    .in("id", ids);
  if (itemsError) throw itemsError;
  return (items ?? []) as CatalogItem[];
}

// ---------------------------------------------------------------------------
// Recently viewed (owner-only via RLS)
// ---------------------------------------------------------------------------
export async function recordRecentlyViewed(clothingId: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  // Upsert per (user_id, clothing_id) — refreshes viewed_at.
  await supabase
    .from("recently_viewed")
    .upsert(
      { user_id: uid, clothing_id: clothingId },
      { onConflict: "user_id,clothing_id" },
    );
}

export async function fetchRecentlyViewed(limit = 20): Promise<CatalogItem[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("recently_viewed")
    .select("clothing_id")
    .order("viewed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.clothing_id as string);
  if (!ids.length) return [];
  const { data: items } = await supabase.from("clothing").select("*").in("id", ids);
  return (items ?? []) as CatalogItem[];
}

// ---------------------------------------------------------------------------
// My closet (clothing_items), owner-only via RLS
// ---------------------------------------------------------------------------
export async function fetchMyCloset(): Promise<ClothingItem[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("clothing_items")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClothingItem[];
}

export async function insertClothingItem(item: {
  name?: string;
  category?: string;
  color?: string;
  size?: string;
  style?: string;
  brand?: string;
  season?: string;
  occasion?: string[];
  image_url?: string;
  tags?: string[];
}): Promise<ClothingItem> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("clothing_items")
    .insert({
      user_id: uid,
      ...item,
      occasion: item.occasion ?? [],
      tags: item.tags ?? [],
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ClothingItem;
}

/** Update metadata for a user-owned wardrobe item (owner-only via RLS). */
export async function updateClothingItem(
  itemId: string,
  fields: Partial<{
    name: string | null;
    category: string | null;
    color: string | null;
    size: string | null;
    style: string | null;
    brand: string | null;
    season: string | null;
    occasion: string[];
    tags: string[];
  }>,
): Promise<ClothingItem> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("clothing_items")
    .update({ ...fields })
    .eq("id", itemId)
    .select("*")
    .single();
  if (error) throw error;
  return data as ClothingItem;
}

export async function deleteClothingItem(itemId: string): Promise<void> {
  const { error } = await supabase.from("clothing_items").delete().eq("id", itemId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Wardrobe item favorites (target_type = "item"; owner-only via RLS)
// ---------------------------------------------------------------------------
export async function fetchItemFavoriteIds(): Promise<Set<string>> {
  const uid = await currentUserId();
  if (!uid) return new Set();
  const { data, error } = await supabase
    .from("favorites")
    .select("target_id")
    .eq("target_type", "item");
  if (error) throw error;
  return new Set((data ?? []).map((f) => f.target_id as string));
}

export async function addItemFavorite(itemId: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase
    .from("favorites")
    .insert({ user_id: uid, target_type: "item", target_id: itemId });
  if (error) throw error;
}

export async function removeItemFavorite(itemId: string): Promise<void> {
  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("target_type", "item")
    .eq("target_id", itemId);
  if (error) throw error;
}

export async function uploadToWardrobeBucket(
  uri: string,
  name = "item.jpg",
  mime = "image/jpeg",
): Promise<string> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const path = `${uid}/${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const res = await fetch(uri);
  const blob = await res.blob();
  const { data, error } = await supabase.storage
    .from("wardrobe")
    .upload(path, blob, { contentType: mime });
  if (error) throw error;
  // Store the private ref (bucket/uid/name) — resolved to a signed URL to render.
  return `wardrobe/${data.path}`;
}

// ---------------------------------------------------------------------------
// SAVED OUTFITS (saved_outfits), owner-only via RLS
// ---------------------------------------------------------------------------
export interface SavedOutfit {
  id: string;
  user_id: string;
  name: string | null;
  occasion: string | null;
  clothing_ids: string[];
  try_on_id: string | null;
  result_url: string | null;
  created_at: string;
}

export async function fetchSavedOutfits(): Promise<SavedOutfit[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("saved_outfits")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as SavedOutfit[];
}

export async function insertSavedOutfit(outfit: {
  name?: string | null;
  occasion?: string | null;
  clothing_ids: string[];
  try_on_id?: string | null;
  result_url?: string | null;
}): Promise<SavedOutfit> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("saved_outfits")
    .insert({
      user_id: uid,
      name: outfit.name ?? null,
      occasion: outfit.occasion ?? null,
      clothing_ids: outfit.clothing_ids,
      try_on_id: outfit.try_on_id ?? null,
      result_url: outfit.result_url ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as SavedOutfit;
}

export async function deleteSavedOutfit(outfitId: string): Promise<void> {
  const { error } = await supabase.from("saved_outfits").delete().eq("id", outfitId);
  if (error) throw error;
}