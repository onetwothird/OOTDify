// Hands the live try-on screen the garment picked on Scan (same cross-screen
// bridge pattern as ../selectionStore.ts).
import { create } from "zustand";

export interface LiveGarment {
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

export const useLiveGarment = create<LiveGarmentState>((set) => ({
  garment: null,
  set: (garment) => set({ garment }),
  clear: () => set({ garment: null }),
}));
