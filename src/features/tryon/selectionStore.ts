// C:\OOTDify\src\features\tryon\selectionStore.ts
// Cross-tab bridge: "Use in try-on" from Discover/Home hands the Scan tab a
// preselected garment (+ optional body photo) without dead-end navigation.
import { create } from "zustand";

interface TryOnSelectionState {
  /** clothing (catalog) or clothing_items (closet) id */
  clothingId: string | null;
  clothingSource: "catalog" | "item" | null;
  bodyPhotoId: string | null;
  setClothing: (id: string, source: "catalog" | "item") => void;
  setBodyPhoto: (id: string) => void;
  consume: () => { clothingId: string | null; clothingSource: "catalog" | "item" | null; bodyPhotoId: string | null };
}

export const useTryOnSelection = create<TryOnSelectionState>((set, get) => ({
  clothingId: null,
  clothingSource: null,
  bodyPhotoId: null,
  setClothing: (clothingId, clothingSource) => set({ clothingId, clothingSource }),
  setBodyPhoto: (bodyPhotoId) => set({ bodyPhotoId }),
  consume: () => {
    const state = get();
    set({ clothingId: null, clothingSource: null, bodyPhotoId: null });
    return state;
  },
}));