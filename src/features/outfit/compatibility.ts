import { Outfit } from "./types";

// Simple compatibility scoring: returns 0-100
export function scoreOutfit(outfit: Outfit): number {
  if (!outfit || !outfit.items) return 0;
  // Heuristic: more items -> higher variety score; items without category reduce score
  const valid = outfit.items.filter((i) => !!i.category);
  const ratio = valid.length / Math.max(1, outfit.items.length);
  const base = Math.round(ratio * 80);
  // small random adjustment for variety
  const adj = Math.min(20, outfit.items.length * 2);
  return Math.min(100, base + adj);
}
