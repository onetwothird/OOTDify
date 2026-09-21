// C:\OOTDify\src\features\outfit\generator.ts
// Deterministic, pure outfit composer.
//
// It builds ONE outfit from REAL catalog items (usually the server
// recommendations from /api/recommend). There is no randomness: given the
// same input + seed, the same outfit comes out — which makes it testable and
// honest. Category pairing (top → bottom → shoe → outerwear when cold) mirrors
// the backend composer's intent.

import { CatalogItem, ClothingItem } from "../clothing/types";
import { uuid } from "../../shared/lib/uuid";
import { scoreOutfit } from "./compatibility";
import { Outfit, OutfitEntry } from "./types";

export interface GeneratorOptions {
  occasion?: string;
  weather?: { tempC?: number; condition?: string };
  seed?: number;
}

/** Deterministic hash for stable ordering (FNV-1a over a string seed). */
function hashKey(seed: number, id: string): number {
  let h = (seed >>> 0) ^ 2166136261;
  const input = `${seed}:${id}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function byCategory(items: Array<CatalogItem | ClothingItem>, keyword: string) {
  return items.filter((it) => (it.category ?? "").toLowerCase().includes(keyword));
}

function pick(items: Array<CatalogItem | ClothingItem>, seed: number): OutfitEntry | null {
  if (!items.length) return null;
  const sorted = [...items].sort(
    (a, b) => hashKey(seed, a.id) - hashKey(seed, b.id),
  );
  const picked = sorted[0];
  // The recommendation scorer already returns real catalog rows; closet items
  // keep source "item".
  const source: OutfitEntry["source"] =
    "price" in picked && typeof picked.price !== "undefined" ? "catalog" : "item";
  return { id: picked.id, source, item: picked };
}

/**
 * Compose a single outfit deterministically.
 * Returns null when fewer than one useable item is provided.
 */
export function generateOutfit(
  pool: Array<CatalogItem | ClothingItem>,
  opts: GeneratorOptions = {},
): Outfit | null {
  if (!pool.length) return null;

  const seed = (opts.seed ?? 42) >>> 0;
  const temp = opts.weather?.tempC;
  const isCold = typeof temp === "number" && temp <= 10;
  const isHot = typeof temp === "number" && temp >= 25;

  // Hot days: drop heavy outer layers from the pool.
  const usable = isHot
    ? pool.filter((it) => !(it.category ?? "").toLowerCase().includes("outer"))
    : pool;
  const source = usable.length ? usable : pool;

  const entries: OutfitEntry[] = [];
  const push = (candidate: OutfitEntry | null) => {
    if (candidate && !entries.some((e) => e.id === candidate.id)) {
      entries.push(candidate);
    }
  };

  push(pick(byCategory(source, "top"), seed));
  push(pick(byCategory(source, "bottom"), seed));
  push(pick(byCategory(source, "shoe"), seed));
  if (isCold) push(pick(byCategory(source, "outer"), seed));

  // Fill up to 4 slots from what remains so smaller wardrobes still produce
  // a complete outfit; deterministic order avoids any RNG.
  const remaining = source.filter((it) => !entries.some((e) => e.id === it.id));
  const sortedRemaining = [...remaining].sort(
    (a, b) => hashKey(seed ^ 0x9e37, a.id) - hashKey(seed ^ 0x9e37, b.id),
  );
  let i = 0;
  while (entries.length < Math.min(4, source.length) && i < sortedRemaining.length) {
    const candidate = sortedRemaining[i];
    if (!entries.some((e) => e.id === candidate.id)) {
      entries.push({
        id: candidate.id,
        source: "price" in candidate && typeof candidate.price !== "undefined" ? "catalog" : "item",
        item: candidate,
      });
    }
    i++;
  }

  const outfit: Outfit = {
    id: uuid(),
    items: entries,
    createdAt: new Date().toISOString(),
    occasion: opts.occasion ?? null,
    weatherContext: opts.weather?.condition ?? null,
    score: scoreOutfit({ id: "", items: entries, createdAt: "" } as Outfit),
  };
  return outfit;
}

/** Keep the previous async-friendly name used by tests/screens. */
export async function generateOutfits(
  pool: Array<CatalogItem | ClothingItem>,
  opts: GeneratorOptions = {},
): Promise<Outfit[]> {
  const outfit = generateOutfit(pool, opts);
  return outfit ? [outfit] : [];
}