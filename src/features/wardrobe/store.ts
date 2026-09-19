import { create } from "zustand";
import { ClothingItem } from "../closet/types";

// Demo seed so the app has content to show before any clothes are captured.
// These are the three pieces that used to live in the old mock store.
const demoItems: ClothingItem[] = [
  {
    id: "1",
    name: "Oversized White Tee",
    category: "top",
    vibe: "Minimalist Core",
    images: [
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=400",
    ],
    tags: [],
  },
  {
    id: "2",
    name: "Cargo Pants",
    category: "bottom",
    vibe: "Streetwear",
    images: [
      "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?q=80&w=400",
    ],
    tags: [],
  },
  {
    id: "3",
    name: "Clean White Kicks",
    category: "shoes",
    vibe: "Clean Kicks",
    images: [
      "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?q=80&w=400",
    ],
    tags: [],
  },
];

interface WardrobeState {
  items: ClothingItem[];
  addItem: (item: ClothingItem) => void;
  addItems: (items: ClothingItem[]) => void;
  setItems: (items: ClothingItem[]) => void;
}

const useWardrobeStoreImpl = create<WardrobeState>((set) => ({
  items: demoItems,
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  addItems: (items) =>
    set((state) => ({ items: [...state.items, ...items] })),
  setItems: (items) => set({ items }),
}));

/**
 * Static-style helper for use outside React components (services,
 * callbacks, non-hook code like history.ts). It's backed by the same
 * zustand store, so anything subscribed via `useWardrobeStore` re-renders
 * automatically whenever these are called.
 */
export const WardrobeStore = {
  list: (): ClothingItem[] => useWardrobeStoreImpl.getState().items,
  save: (items: ClothingItem[]) =>
    useWardrobeStoreImpl.getState().setItems(items),
  addItem: (item: ClothingItem) => useWardrobeStoreImpl.getState().addItem(item),
  addItems: (items: ClothingItem[]) =>
    useWardrobeStoreImpl.getState().addItems(items),
};

// React hook for components that want to subscribe and re-render on change
// e.g. const items = useWardrobeStore((s) => s.items);
export const useWardrobeStore = useWardrobeStoreImpl;

export type { ClothingItem };