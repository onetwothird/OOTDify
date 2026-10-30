// Closet photos are stored as "wardrobe/<object path>". Deleting a piece also
// deletes its photo, but only one that lives in the private wardrobe bucket.

const PREFIX = "wardrobe/";

/** The wardrobe bucket path of a closet photo ref, or null for any other photo. */
export function wardrobeObjectPath(ref: string | null): string | null {
  if (!ref || !ref.startsWith(PREFIX)) return null;
  const path = ref.slice(PREFIX.length);
  return path ? path : null;
}
