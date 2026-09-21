// C:\OOTDify\src\features\outfit\types.ts
import { CatalogItem, ClothingItem } from "../clothing/types";

/** One piece of an outfit — always a REAL id from the catalog or the user's
 * closet (never a fake/placeholder entry). */
export interface OutfitEntry {
  id: string;
  source: "catalog" | "item";
  item: CatalogItem | ClothingItem;
}

export interface Outfit {
  id: string;
  items: OutfitEntry[];
  createdAt: string; // ISO
  occasion?: string | null;
  weatherContext?: string | null;
  /** Deterministic 0..100 compatibility score. */
  score: number;
  try_on_id?: string | null;
  result_url?: string | null;
}