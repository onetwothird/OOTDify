// C:\OOTDify\src\features\history\history.ts
// Outfit history is now REAL data in the `saved_outfits` table (owner-only via
// RLS). There is no AsyncStorage mirror / no local-only history.
import {
  deleteSavedOutfit,
  fetchSavedOutfits,
  insertSavedOutfit,
  SavedOutfit,
} from "../clothing/service";
import { Outfit } from "../outfit/types";

/** Persist an outfit the user saved (by choice). */
export async function recordOutfit(outfit: Outfit): Promise<SavedOutfit> {
  return insertSavedOutfit({
    name: outfit.occasion ? `${outfit.occasion} outfit` : null,
    occasion: outfit.occasion ?? null,
    clothing_ids: outfit.items.map((e) => e.id),
    try_on_id: outfit.try_on_id ?? null,
    result_url: outfit.result_url ?? null,
  });
}

export async function getHistory(): Promise<SavedOutfit[]> {
  return fetchSavedOutfits();
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  await deleteSavedOutfit(id);
}