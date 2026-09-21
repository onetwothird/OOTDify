// C:\OOTDify\src\features\outfit\compatibility.ts
import { Outfit } from "./types";

/**
 * Deterministic outfit compatibility score (0–100).
 *
 * Heuristics, no randomness:
 *   - fewer invalid (uncategorised) entries → higher score
 *   - core coverage (top/bottom/shoe) rewarded
 *   - larger outfits get a small variety bonus (cap 20)
 */
export function scoreOutfit(outfit: Outfit): number {
  if (!outfit || !outfit.items?.length) return 0;

  const cats = outfit.items
    .map(({ item }) => (item?.category ?? "").toLowerCase())
    .filter(Boolean);
  const valid = cats.length;
  const ratio = valid / outfit.items.length;
  const base = Math.round(ratio * 80);

  let coverage = 0;
  if (cats.some((c) => c.includes("top"))) coverage += 6;
  if (cats.some((c) => c.includes("bottom") || c.includes("pant") || c.includes("jean") || c.includes("skirt"))) coverage += 6;
  if (cats.some((c) => c.includes("shoe") || c.includes("sneaker") || c.includes("boot"))) coverage += 4;

  const variety = Math.min(20, outfit.items.length * 2);
  return Math.min(100, base + coverage + variety);
}