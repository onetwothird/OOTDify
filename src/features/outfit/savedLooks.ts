// Saved looks are either mine (built from my closet) or saved from someone
// else's Discover post. Pure, so both kinds are unit-tested.

interface SavedLookLike {
  id: string;
  clothing_ids: string[] | null;
  result_url: string | null;
  source_post_id?: string | null;
}

/** Up to `max` photos for a saved look: my pieces, or the post photo it was saved from. */
export function lookThumbnails(
  outfit: SavedLookLike,
  pieces: Record<string, { image_url: string | null } | undefined>,
  max = 4,
): string[] {
  if (outfit.source_post_id) return outfit.result_url ? [outfit.result_url] : [];
  const urls: string[] = [];
  for (const id of outfit.clothing_ids ?? []) {
    const url = pieces[id]?.image_url;
    if (url) urls.push(url);
    if (urls.length >= max) break;
  }
  return urls;
}

/** Where tapping a saved look goes: my look's page, or the post it was saved from. */
export function savedLookTarget(outfit: SavedLookLike): { kind: "outfit" | "post"; id: string } {
  return outfit.source_post_id ? { kind: "post", id: outfit.source_post_id } : { kind: "outfit", id: outfit.id };
}
