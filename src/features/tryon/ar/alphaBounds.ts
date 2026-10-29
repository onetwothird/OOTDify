import type { Bounds } from "./bodyMesh";

/**
 * Normalized box around the opaque pixels of an RGBA image. Garment PNGs carry
 * transparent padding; bodyMesh maps texture coordinates to this box instead
 * of the whole image. A fully transparent image yields the full bounds.
 */
export function alphaBounds(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 16,
): Bounds {
  "worklet";
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4 + 3;
    for (let x = 0; x < width; x++) {
      if (rgba[row + x * 4] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width: 1, height: 1 };
  return {
    x: minX / width,
    y: minY / height,
    width: (maxX + 1 - minX) / width,
    height: (maxY + 1 - minY) / height,
  };
}
