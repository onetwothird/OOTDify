// Which body slot a closet item goes on in the live try-on. Clothing comes
// from its category; accessories (all saved as "Accessories") from whole-word
// keywords in their tags, then name, then description, in English and
// Filipino. Pure and native-free.

/** Kinds drawn with the stretch mesh (bodyMesh.ts). */
export type MeshKind = "upper" | "outer" | "dress" | "bottom";
/** Kinds placed as rigid quads (accessoryFit.ts). */
export type AccessoryKind = "hat" | "glasses" | "earrings" | "necklace" | "watch" | "belt" | "bag" | "shoes";
export type ItemKind = MeshKind | AccessoryKind;

export interface KindSource {
  category: string | null;
  tags?: string[] | null;
  name?: string | null;
  description?: string | null;
}

const CATEGORY_KINDS: Record<string, ItemKind> = {
  tops: "upper",
  outerwear: "outer",
  dresses: "dress",
  bottoms: "bottom",
  shoes: "shoes",
  bags: "bag",
};

/** Keyword table, first match wins. `null` marks items MoveNet can't place (rings: no finger points). */
const WORDS: [ItemKind | null, string[]][] = [
  ["hat", ["hat", "cap", "beanie", "beret", "fedora", "bucket hat", "visor", "sumbrero", "sombrero"]],
  ["glasses", ["glasses", "eyeglasses", "sunglasses", "shades", "spectacles", "salamin"]],
  ["earrings", ["earring", "earrings", "hikaw"]],
  ["necklace", ["necklace", "pendant", "choker", "chain", "scarf", "bandana", "kwintas", "kuwintas", "alampay"]],
  ["watch", ["watch", "smartwatch", "bracelet", "bangle", "wristband", "relo", "pulseras"]],
  ["belt", ["belt", "sinturon"]],
  [null, ["ring", "rings", "singsing"]],
];

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

/** Whether `phrase` (one or more words) appears as adjacent whole words in `words`. */
function hasPhrase(words: string[], phrase: string): boolean {
  const parts = phrase.split(" ");
  for (let i = 0; i + parts.length <= words.length; i++) {
    if (parts.every((p, j) => words[i + j] === p)) return true;
  }
  return false;
}

/** The first table row matching `text`: a kind, null for a ring, or undefined for no match. */
function matchWords(text: string): ItemKind | null | undefined {
  const words = tokens(text);
  if (words.length === 0) return undefined;
  for (const [kind, phrases] of WORDS) {
    if (phrases.some((p) => hasPhrase(words, p))) return kind;
  }
  return undefined;
}

export function itemKind(src: KindSource): ItemKind | null {
  const category = src.category?.toLowerCase() ?? "";
  if (Object.prototype.hasOwnProperty.call(CATEGORY_KINDS, category)) return CATEGORY_KINDS[category];
  const sources = [(src.tags ?? []).join(" "), src.name ?? "", src.description ?? ""];
  for (const text of sources) {
    const kind = matchWords(text);
    if (kind !== undefined) return kind;
  }
  return null;
}

export function isMeshKind(kind: ItemKind): kind is MeshKind {
  "worklet";
  return kind === "upper" || kind === "outer" || kind === "dress" || kind === "bottom";
}
