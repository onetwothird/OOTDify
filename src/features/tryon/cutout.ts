// C:\OOTDify\src\features\tryon\cutout.ts
// Garment cut-out loader for the live AR try-on: fetch a closet item as a
// transparent PNG and cache it on-device. The cache key includes a hash of
// image_url, so a replaced photo is refetched. The size lives in a sidecar
// <name>.json; a cache hit needs both files.
import { File, Paths } from "expo-file-system";

import { getClothingCutout, type IsolationReason } from "../../services/aiApi";

export type CutoutOutcome =
  | { status: "ready"; uri: string; width: number; height: number }
  | { status: "failed"; reason: IsolationReason | null }
  | { status: "error" };

/** FNV-1a 32-bit hash, hex. */
function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

export function cutoutFileName(itemId: string, imageUrl: string): string {
  return `cutout-${itemId}-${hashString(imageUrl)}.png`;
}

export async function getGarmentCutout(item: { id: string; image_url: string }): Promise<CutoutOutcome> {
  try {
    const name = cutoutFileName(item.id, item.image_url);
    const png = new File(Paths.cache, name);
    const meta = new File(Paths.cache, name.replace(/\.png$/, ".json"));

    if (png.exists && meta.exists) {
      try {
        const size = JSON.parse(await meta.text()) as { width?: unknown; height?: unknown };
        if (typeof size.width === "number" && typeof size.height === "number") {
          return { status: "ready", uri: png.uri, width: size.width, height: size.height };
        }
      } catch {
        // Corrupt sidecar: fall through and refetch.
      }
    }

    const result = await getClothingCutout(item.id);
    if (!result.ok || !result.png_base64 || !result.width || !result.height) {
      return { status: "failed", reason: result.reason };
    }
    png.write(result.png_base64, { encoding: "base64" });
    meta.write(JSON.stringify({ width: result.width, height: result.height }));
    return { status: "ready", uri: png.uri, width: result.width, height: result.height };
  } catch (e) {
    console.warn("Garment cut-out failed:", e);
    return { status: "error" };
  }
}
