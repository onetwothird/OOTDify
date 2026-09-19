import { ClothingItem } from "../closet/types";

export type Outfit = {
  id: string;
  items: ClothingItem[];
  createdAt: string; // ISO date
  occasion?: string;
  weatherContext?: string;
};
