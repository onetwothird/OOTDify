import { create } from 'zustand';
import { ClothingItem, Outfit } from '../types';

interface WardrobeState {
  items: ClothingItem[];
  outfits: Outfit[];
  addItem: (item: ClothingItem) => void;
  addOutfit: (outfit: Outfit) => void;
}

// 1. Individual clothing pieces (For the "Items" tab)
const mockItems: ClothingItem[] = [
  { id: '1', category: 'top', vibe: 'Minimalist Core', imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=400' },
  { id: '2', category: 'bottom', vibe: 'Streetwear', imageUrl: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?q=80&w=400' },
  { id: '3', category: 'shoes', vibe: 'Clean Kicks', imageUrl: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?q=80&w=400' },
];

// 2. Completed outfit collages (For the "Outfits" tab)
// Note: We cast 'as any[]' here just to ensure it safely maps to whatever your Outfit type expects in types.ts
const mockOutfits: any[] = [
  { id: 'o1', imageUrl: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?q=80&w=400' },
  { id: 'o2', imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=400' },
  { id: 'o3', imageUrl: 'https://images.unsplash.com/photo-1520975954732-57dd22299614?q=80&w=400' },
  { id: 'o4', imageUrl: 'https://images.unsplash.com/photo-1485230895905-ef05ba63b2f4?q=80&w=400' },
];

export const useWardrobeStore = create<WardrobeState>((set) => ({
  items: mockItems,
  outfits: mockOutfits,
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  addOutfit: (outfit) => set((state) => ({ outfits: [...state.outfits, outfit] })),
}));

export { ClothingItem };