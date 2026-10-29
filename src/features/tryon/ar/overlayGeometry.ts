// Shared types and the preview mapping for the live try-on. Keypoints are
// normalized 0..1 of the camera frame; `pointToPreview` maps them onto the
// on-screen preview, which shows the frame with a "cover" crop and, for the
// front camera, mirrored.

export interface Keypoint {
  name: string;
  x: number;
  y: number;
  confidence: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}

export const MIN_KEYPOINT_CONFIDENCE = 0.3;

function cover(photo: Size, preview: Size) {
  "worklet";
  const scale = Math.max(preview.width / photo.width, preview.height / photo.height);
  return {
    scaledW: photo.width * scale,
    scaledH: photo.height * scale,
    offsetX: (preview.width - photo.width * scale) / 2,
    offsetY: (preview.height - photo.height * scale) / 2,
  };
}

/** A normalized photo point → preview pixels. */
export function pointToPreview(p: Point, photo: Size, preview: Size, mirrored: boolean): Point {
  "worklet";
  const { scaledW, scaledH, offsetX, offsetY } = cover(photo, preview);
  const x = mirrored ? 1 - p.x : p.x;
  return { x: x * scaledW + offsetX, y: p.y * scaledH + offsetY };
}
