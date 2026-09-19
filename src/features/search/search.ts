import { ClothingItem } from "../closet/types";

export function searchCloset(
  items: ClothingItem[],
  query: string,
): ClothingItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => {
    const hay = [it.name, it.category, it.color, ...(it.tags || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
