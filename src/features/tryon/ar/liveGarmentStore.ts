// Hands the live try-on screen the garment picked on Scan (same cross-screen
// bridge pattern as ../selectionStore.ts).
import { create } from "zustand";

export interface LiveGarment {
  /** Closet item id, for the cut-out route. */
  id: string;
  /** Storage ref or URL, resolved on the live screen (signed URLs expire). */
  imageRef: string;
  category: string | null;
  name: string;
}

interface LiveGarmentState {
  garment: LiveGarment | null;
  set: (garment: LiveGarment) => void;
  clear: () => void;
}

/**
 * The garment the live preview can open with: exactly one selected item that
 * is in the list on screen and has an image. Null means "hide the button".
 */
export function liveGarmentCandidate<T extends { id: string; image_url: string | null }>(
  selected: Set<string>,
  items: T[],
): (T & { image_url: string }) | null {
  if (selected.size !== 1) return null;
  const [id] = Array.from(selected);
  const item = items.find((i) => i.id === id);
  return item?.image_url ? (item as T & { image_url: string }) : null;
}

export const useLiveGarment = create<LiveGarmentState>((set) => ({
  garment: null,
  set: (garment) => set({ garment }),
  clear: () => set({ garment: null }),
}));
