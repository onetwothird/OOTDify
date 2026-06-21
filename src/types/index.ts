// src/types/index.ts
export interface ClothingItem {
  id: string;
  imageUrl: string;
  category: 'top' | 'bottom' | 'shoes' | 'outerwear';
  vibe: string;
}

export interface Outfit {
  id: string;
  name: string;
  items: ClothingItem[];
}