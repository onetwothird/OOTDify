import { ClothingItem } from "./types";

// Scan images with optional external API defined by env var `CLOSET_SCANNER_API_URL`.
// If not set or request fails, falls back to a simple local stub.
export async function scanImages(images: string[]): Promise<ClothingItem[]> {
  let api = process.env.CLOSET_SCANNER_API_URL || "";
  try {
    const stored = localStorage.getItem("CLOSET_SCANNER_API_URL");
    if (!api && stored) api = stored;
  } catch (e) {}
  if (api && images.length) {
    try {
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });
      if (res.ok) {
        const json = await res.json();
        // Expect API to return array of ClothingItem-like objects
        return (json || []).map((it: any, i: number) => ({
          id: it.id || `item-${Date.now()}-${i}`,
          name: it.name || `Scanned Item ${i + 1}`,
          category: it.category || "unknown",
          images: it.images || [images[i] || ""],
          tags: it.tags || [],
          wearCount: it.wearCount || 0,
        }));
      }
    } catch (e) {
      console.warn("External scanner API failed:", e);
      // fall through to local stub
    }
  }

  // Local fallback: create items from images
  return images.map((src, i) => ({
    id: `item-${Date.now()}-${i}`,
    name: `Scanned Item ${i + 1}`,
    category: "unknown",
    images: [src],
    tags: [],
    wearCount: 0,
  }));
}
