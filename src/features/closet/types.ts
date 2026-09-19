// Canonical clothing item type shared by every feature (scanning, wardrobe,
// outfit generation, search, history).
export type ClothingItem = {
  id: string;
  name: string;
  category: string;
  color?: string;
  images: string[];
  tags?: string[];
  lastWorn?: string; // ISO date
  wearCount?: number;
  vibe?: string; // optional style label, e.g. "Minimalist Core" (used by the Fit Breakdown screen)
};

export type ScanResult = ClothingItem;
