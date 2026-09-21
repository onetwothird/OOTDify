// C:\OOTDify\src\features\closet\types.ts
// Canonical types for the user's closet + scanning flow.
// The single source of truth for `ClothingItem` is the DB-shaped type in
// features/clothing/types.ts (public.clothing_items). Re-exported here so
// feature code keeps importing from the same place it always did.
export type { ClothingItem, FavoriteRow } from "../clothing/types";

export interface ScanPreview {
  personDetected: boolean;
  detections: Array<{ class: string; confidence: number }>;
  message?: string;
}