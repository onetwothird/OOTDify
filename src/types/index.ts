// src/types/index.ts
export interface ClothingItem {
  id: string;
  category: 'top' | 'bottom' | 'shoes' | 'outerwear' | 'outfit'; 
  vibe: string;
  imageUrl: string;
}

export interface Outfit {
  id: string;
  name: string;
  items: ClothingItem[];
}