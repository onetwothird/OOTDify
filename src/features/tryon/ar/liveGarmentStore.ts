// Hands the live try-on screen the outfit picked on Scan or an item page (same
// cross-screen bridge pattern as ../selectionStore.ts).
import { create } from "zustand";

import { itemKind, type ItemKind } from "./itemKind";

export interface LiveGarment {
  /** Closet item id, for the cut-out route. */
  id: string;
  /** Storage ref or URL, resolved on the live screen (signed URLs expire). */
  imageRef: string;
  category: string | null;
  name: string;
  /** Body slot; null when the live preview can't place it (named on screen). */
  kind: ItemKind | null;
}

interface LiveGarmentState {
  garments: LiveGarment[];
  set: (garments: LiveGarment[]) => void;
  clear: () => void;
}

interface OutfitSource {
  id: string;
  image_url: string | null;
  category: string | null;
  name: string | null;
  tags?: string[] | null;
  description?: string | null;
}

/**
 * The outfit the live preview opens with: the selected items in the list that
 * have an image, in selection order. Null (hide the button) when none of them
 * can be placed.
 */
export function liveOutfit<T extends OutfitSource>(
  selected: Iterable<string>,
  items: T[],
  fallbackName: string,
): LiveGarment[] | null {
  const garments: LiveGarment[] = [];
  for (const id of selected) {
    const item = items.find((i) => i.id === id);
    if (!item?.image_url) continue;
    garments.push({
      id: item.id,
      imageRef: item.image_url,
      category: item.category ?? null,
      name: item.name || fallbackName,
      kind: itemKind(item),
    });
  }
  return garments.some((g) => g.kind !== null) ? garments : null;
}

export const useLiveGarment = create<LiveGarmentState>((set) => ({
  garments: [],
  set: (garments) => set({ garments }),
  clear: () => set({ garments: [] }),
}));
