// Which half of the Wardrobe tab to open, from its `section` route param.
// Pure, so links like "/(tabs)/wardrobe?section=outfits" are tested.

export type WardrobeSection = "closet" | "outfits";

export function wardrobeSection(param: string | string[] | undefined): WardrobeSection {
  const value = Array.isArray(param) ? param[0] : param;
  return value === "outfits" ? "outfits" : "closet";
}
