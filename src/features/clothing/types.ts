// C:\OOTDify\src\features\clothing\types.ts
// The shared clothing catalog (public.clothing), read via Supabase RLS from
// the anon client. This is REAL database data — never hardcoded.

// Mirrors the clothing table in supabase/schema.sql.
export interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  gender: string;
  color: string[];
  sizes: string[];
  style: string | null;
  brand: string | null;
  occasion: string[];
  price: number | null;
  currency: string;
  image_url: string;
  thumbnail_url: string | null;
  created_at: string;
  /** Present when the row came from the recommender. */
  score?: number;
  score_normalized?: number;
}

export const CATALOG_CATEGORIES = [
  "Tops",
  "Bottoms",
  "Shoes",
  "Outerwear",
  "Dresses",
  "Bags",
  "Accessories",
] as const;

/** Categories a user can organize their OWN wardrobe into. */
export const WARDROBE_CATEGORIES = [
  "Tops",
  "Bottoms",
  "Dresses",
  "Shoes",
  "Outerwear",
  "Accessories",
  "Bags",
  "Other",
] as const;

export const SEASONS = ["Spring", "Summer", "Fall", "Winter", "All-season"] as const;

export const OCCASIONS = [
  "Casual",
  "School",
  "Office",
  "Interview",
  "Date",
  "Formal",
  "Party",
  "Travel",
  "Gym",
  "Beach",
] as const;

// Single user-owned wardrobe item (public.clothing_items).
export interface ClothingItem {
  id: string;
  user_id: string;
  clothing_id: string | null;
  name: string | null;
  category: string | null;
  color: string | null;
  size: string | null;
  style: string | null;
  brand: string | null;
  season: string | null;
  occasion: string[];
  image_url: string | null; // private storage ref or external URL
  tags: string[];
  wear_count: number;
  last_worn: string | null;
  created_at: string;
}

export interface FavoriteRow {
  id: string;
  user_id: string;
  target_type: "clothing" | "item";
  target_id: string;
  created_at: string;
}