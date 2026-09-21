import { create } from "zustand";
import { ClothingItem } from "../clothing/types";
import {
  deleteClothingItem,
  fetchMyCloset,
  updateClothingItem,
} from "../clothing/service";

interface WardrobeState {
  items: ClothingItem[];
  loading: boolean;
  error: string | null;
  loadFromServer: () => Promise<void>;
  addItem: (item: ClothingItem) => void;
  addItems: (items: ClothingItem[]) => void;
  setItems: (items: ClothingItem[]) => void;
  updateItem: (
    id: string,
    fields: Parameters<typeof updateClothingItem>[1],
  ) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  reset: () => void;
}

// Real data only: items are loaded from public.clothing_items (RLS owner-only)
// via loadFromServer(), or added by the capture flow. There is NO demo seed.
const useWardrobeStoreImpl = create<WardrobeState>((set) => ({
  items: [],
  loading: false,
  error: null,
  loadFromServer: async () => {
    set({ loading: true, error: null });
    try {
      const items = await fetchMyCloset();
      set({ items, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : "Could not load your closet.",
      });
    }
  },
  addItem: (item) => set((state) => ({ items: [item, ...state.items] })),
  addItems: (items) =>
    set((state) => ({ items: [...items, ...state.items] })),
  setItems: (items) => set({ items }),
  updateItem: async (id, fields) => {
    const updated = await updateClothingItem(id, fields);
    set((state) => ({
      items: state.items.map((it) => (it.id === id ? updated : it)),
    }));
  },
  removeItem: async (id) => {
    // Optimistic removal; the DB is authoritative.
    set((state) => ({ items: state.items.filter((it) => it.id !== id) }));
    try {
      await deleteClothingItem(id);
    } catch (e) {
      // Roll back so the item reappears.
      set((state) => ({ items: state.items }));
      throw e;
    }
  },
  reset: () => set({ items: [], loading: false, error: null }),
}));

/** Non-hook access for services/callbacks (same store underneath). */
export const WardrobeStore = {
  list: (): ClothingItem[] => useWardrobeStoreImpl.getState().items,
  save: (items: ClothingItem[]) => useWardrobeStoreImpl.getState().setItems(items),
  addItem: (item: ClothingItem) => useWardrobeStoreImpl.getState().addItem(item),
  addItems: (items: ClothingItem[]) => useWardrobeStoreImpl.getState().addItems(items),
  updateItem: (id: string, fields: Parameters<typeof updateClothingItem>[1]) =>
    useWardrobeStoreImpl.getState().updateItem(id, fields),
  removeItem: (id: string) => useWardrobeStoreImpl.getState().removeItem(id),
  refresh: () => useWardrobeStoreImpl.getState().loadFromServer(),
  reset: () => useWardrobeStoreImpl.getState().reset(),
};

export const useWardrobeStore = useWardrobeStoreImpl;

export type { ClothingItem };