// Search + category filter for the My closet screen.
import type { ClothingItem } from "../clothing/types";

/**
 * Case-insensitive substring match on every descriptive field (name,
 * category, colour, size, brand, style, season, tags, occasions); keeps order.
 */
export function filterCloset(items: ClothingItem[], query: string, category: string | null): ClothingItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (category && item.category !== category) return false;
    if (!q) return true;
    const haystack = [
      item.name,
      item.category,
      item.color,
      item.size,
      item.brand,
      item.style,
      item.season,
      ...(item.tags ?? []),
      ...(item.occasion ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
