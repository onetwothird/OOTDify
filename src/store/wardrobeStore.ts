// src/store/wardrobeStore.ts
import { create } from 'zustand';
import { ClothingItem } from '../types';

interface WardrobeState {
  items: ClothingItem[];
  currentOutfit: ClothingItem[];
  setCurrentOutfit: (outfit: ClothingItem[]) => void;
}

export const useWardrobeStore = create<WardrobeState>((set) => ({
  items: [
    { id: '1', category: 'top', vibe: 'Boxy Heavyweight Tee', imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=500&auto=format&fit=crop' },
    { id: '2', category: 'bottom', vibe: 'Washed Cargo Pants', imageUrl: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?q=80&w=500&auto=format&fit=crop' },
    { id: '3', category: 'shoes', vibe: 'Chunky Retro Sneakers', imageUrl: 'https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?q=80&w=500&auto=format&fit=crop' },
    { id: '4', category: 'outerwear', vibe: 'Vintage Leather Moto', imageUrl: 'https://images.unsplash.com/photo-1520975954732-57dd22299614?q=80&w=500&auto=format&fit=crop' },
  ],
  currentOutfit: [],
  setCurrentOutfit: (currentOutfit) => set({ currentOutfit }),
}));

export { ClothingItem };
