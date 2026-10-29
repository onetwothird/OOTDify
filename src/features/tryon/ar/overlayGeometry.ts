// Where to draw a garment on the live camera preview.
//
// The backend returns pose keypoints normalized to 0..1 of the snapshot.
// `garmentFit` turns them into a garment box (still normalized) hung from two
// pairs of anchor points; `photoToPreview` / `pointToPreview` map that box
// onto the on-screen preview, which shows the photo with a "cover" crop and,
// for the front camera, mirrored.

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
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Anchors {
  top: [Point, Point];
  bottom: [Point, Point];
}

export type OverlayFit =
  | { kind: "rect"; rect: Rect; anchors: Anchors }
  | { kind: "unsupported" }
  | { kind: "no_pose" };

export const MIN_KEYPOINT_CONFIDENCE = 0.3;

type Joint = "shoulder" | "hip" | "knee" | "ankle";

interface Placement {
  top: Joint;
  bottom: Joint;
  /** Which anchor pair sets the garment width, and by how much. */
  widthFrom: Joint;
  widthScale: number;
}

const UPPER: Placement = { top: "shoulder", bottom: "hip", widthFrom: "shoulder", widthScale: 1.5 };

const PLACEMENTS: Record<string, Placement> = {
  tops: UPPER,
  outerwear: UPPER,
  dresses: { top: "shoulder", bottom: "knee", widthFrom: "shoulder", widthScale: 1.5 },
  bottoms: { top: "hip", bottom: "ankle", widthFrom: "hip", widthScale: 1.8 },
};

/** Extra height above the top anchors / below the bottom ones, as a share of the span. */
const TOP_MARGIN = 0.12;
const BOTTOM_MARGIN = 0.05;

function pair(keypoints: Keypoint[], joint: Joint): [Point, Point] | null {
  const find = (side: "left" | "right") =>
    keypoints.find((k) => k.name === `${side}_${joint}` && k.confidence >= MIN_KEYPOINT_CONFIDENCE);
  const left = find("left");
  const right = find("right");
  return left && right ? [{ x: left.x, y: left.y }, { x: right.x, y: right.y }] : null;
}

const midY = ([a, b]: [Point, Point]) => (a.y + b.y) / 2;
const midX = ([a, b]: [Point, Point]) => (a.x + b.x) / 2;

/** The garment box for `category`, or why it can't be placed. */
export function garmentFit(category: string | null, keypoints: Keypoint[]): OverlayFit {
  const placement = category ? PLACEMENTS[category.toLowerCase()] : undefined;
  if (!placement) return { kind: "unsupported" };

  const top = pair(keypoints, placement.top);
  const bottom = pair(keypoints, placement.bottom);
  const widthPair = placement.widthFrom === placement.top ? top : bottom;
  if (!top || !bottom || !widthPair) return { kind: "no_pose" };

  const topY = midY(top);
  const bottomY = midY(bottom);
  const span = bottomY - topY;
  const width = Math.abs(widthPair[0].x - widthPair[1].x) * placement.widthScale;
  if (span <= 0 || width <= 0) return { kind: "no_pose" };

  const y = topY - span * TOP_MARGIN;
  const height = bottomY + span * BOTTOM_MARGIN - y;
  return {
    kind: "rect",
    rect: { x: midX(widthPair) - width / 2, y, width, height },
    anchors: { top, bottom },
  };
}

function cover(photo: Size, preview: Size) {
  const scale = Math.max(preview.width / photo.width, preview.height / photo.height);
  return {
    scaledW: photo.width * scale,
    scaledH: photo.height * scale,
    offsetX: (preview.width - photo.width * scale) / 2,
    offsetY: (preview.height - photo.height * scale) / 2,
  };
}

/** A normalized photo box → preview pixels. */
export function photoToPreview(rect: Rect, photo: Size, preview: Size, mirrored: boolean): Rect {
  const { scaledW, scaledH, offsetX, offsetY } = cover(photo, preview);
  const x = mirrored ? 1 - rect.x - rect.width : rect.x;
  return {
    x: x * scaledW + offsetX,
    y: rect.y * scaledH + offsetY,
    width: rect.width * scaledW,
    height: rect.height * scaledH,
  };
}

/** A normalized photo point → preview pixels. */
export function pointToPreview(p: Point, photo: Size, preview: Size, mirrored: boolean): Point {
  const { scaledW, scaledH, offsetX, offsetY } = cover(photo, preview);
  const x = mirrored ? 1 - p.x : p.x;
  return { x: x * scaledW + offsetX, y: p.y * scaledH + offsetY };
}
