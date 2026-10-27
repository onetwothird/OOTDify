// Which still-photo size the live preview captures at.
//
// Two reasons not to use the camera default: it is full sensor resolution
// (12–50 MP, slow to capture and shrink every round), and on Android the
// default still can have a different aspect ratio from the preview stream,
// which breaks the "cover" mapping in overlayGeometry. CameraX streams its
// preview at 4:3 by default, so the smallest 4:3 still that is at least
// LIVE_MIN_SHORT_SIDE keeps both aligned and fast.

export const LIVE_MIN_SHORT_SIDE = 480;
const FOUR_THREE = 4 / 3;

/** A `WxH` size from `getAvailablePictureSizesAsync()`, or undefined to keep the default. */
export function pickLivePictureSize(sizes: string[], minShortSide = LIVE_MIN_SHORT_SIDE): string | undefined {
  let best: { size: string; area: number } | undefined;
  for (const size of sizes) {
    const match = /^(\d+)x(\d+)$/.exec(size);
    if (!match) continue; // iOS preset names such as "Photo"
    const a = Number(match[1]);
    const b = Number(match[2]);
    const short = Math.min(a, b);
    const long = Math.max(a, b);
    if (short < minShortSide || Math.abs(long / short - FOUR_THREE) > 0.02) continue;
    if (!best || a * b < best.area) best = { size, area: a * b };
  }
  return best?.size;
}
