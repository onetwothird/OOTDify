import { ClothingItem } from "../closet/types";
import { Outfit } from "./types";

export type GeneratorOptions = {
  occasion?: string;
  weather?: { tempC?: number; condition?: string };
};

// Rule-based generator: prefers one item per core category (top, bottom,
// shoes, and outerwear when it's cold) so outfits actually pair sensibly,
// then fills any remaining slots at random. Replace with ML-driven
// generation later.
export async function generateOutfits(
  wardrobe: ClothingItem[],
  opts: GeneratorOptions = {},
): Promise<Outfit[]> {
  if (wardrobe.length === 0) return [];

  const temp = opts.weather?.tempC;
  const condition = opts.weather?.condition || "";
  const isCold = typeof temp === "number" && temp <= 10;
  const isHot = typeof temp === "number" && temp >= 25;

  // Weather-aware filter: on hot days, drop outerwear from the pool entirely
  const pool = isHot
    ? wardrobe.filter((it) => !(it.category || "").toLowerCase().includes("outer"))
    : wardrobe;
  const usablePool = pool.length ? pool : wardrobe;

  const byCategory = (keyword: string) =>
    usablePool.filter((it) => (it.category || "").toLowerCase().includes(keyword));

  const pickRandom = (arr: ClothingItem[]) =>
    arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;

  const items: ClothingItem[] = [];
  const usedIds = new Set<string>();
  const addIfFound = (candidate?: ClothingItem) => {
    if (candidate && !usedIds.has(candidate.id)) {
      items.push(candidate);
      usedIds.add(candidate.id);
    }
  };

  // Build the core outfit: top, bottom, shoes, and outerwear if it's cold
  addIfFound(pickRandom(byCategory("top")));
  addIfFound(pickRandom(byCategory("bottom")));
  addIfFound(pickRandom(byCategory("shoe")));
  if (isCold) {
    addIfFound(pickRandom(byCategory("outer")));
  }

  // Fill up to 4 items with whatever's left if some categories were missing
  const remaining = usablePool.filter((it) => !usedIds.has(it.id));
  while (items.length < Math.min(4, usablePool.length) && remaining.length) {
    const idx = Math.floor(Math.random() * remaining.length);
    const [next] = remaining.splice(idx, 1);
    addIfFound(next);
  }

  return [
    {
      id: `outfit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      items,
      createdAt: new Date().toISOString(),
      occasion: opts.occasion,
      weatherContext: condition,
    },
  ];
}