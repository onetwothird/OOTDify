// Turns smoothed MoveNet keypoints into a triangle mesh that a Skia layer warps
// the garment image onto. Pure and native-free so it can run in a worklet.
import { MIN_KEYPOINT_CONFIDENCE, type Keypoint, type Point } from "./overlayGeometry";

/** Garment opaque bounds, normalized 0..1 of the garment image. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MeshFit =
  | { kind: "mesh"; vertices: Point[]; texCoords: Point[]; indices: number[] } // vertices normalized to the frame
  | { kind: "unsupported" }
  | { kind: "no_pose" };

export const MESH_COLUMNS = 5; // cells across a row, so 6 vertices per row
export const STRIPS_PER_SEGMENT = 4; // mesh rows between two consecutive anchor rows

const TOP_RAISE = 0.12; // top row rises this share of torso length to cover the collar
const BOTTOM_DROP = 0.05; // bottom row drops this share of the whole span
const MIN_PAIR_WIDTH = 0.02; // a width-setting pair closer than this (of the frame) is noise
const TOP_WIDTH_SCALE = 1.45; // tops/dresses: shoulder width multiplier at the top row
const HIP_WIDTH_SCALE = 1.35; // tops/dresses: hip width multiplier at the hip row
const HIP_MIN_RATIO = 0.85; // hip row is never narrower than this share of the top row
const KNEE_WIDTH_SCALE = 1.1; // dresses: knee row = hip-row width x this
const BOTTOM_WIDTH_SCALE = 1.6; // bottoms: hip width multiplier at the hip row
const LEG_EDGE = 0.25; // bottoms: knee/ankle rows extend past the outer points by this share of hip width
const WAIST_FROM_HIPS = 0.4; // tops: waist row sits this far from the hips toward the shoulders

type Joint = "shoulder" | "hip" | "knee" | "ankle";
export type GarmentKind = "upper" | "dress" | "bottom";

const KINDS: Record<string, GarmentKind> = {
  tops: "upper",
  outerwear: "upper",
  dresses: "dress",
  bottoms: "bottom",
};

/** Left/right edge points of one anchor row, plus its half-width. */
interface Row {
  left: Point;
  right: Point;
  half: number;
}

/** Garment kind for a category (case-insensitive, own keys only), or null when unsupported. */
export function garmentKind(category: string | null): GarmentKind | null {
  "worklet";
  if (category == null) return null;
  const key = category.toLowerCase();
  return Object.prototype.hasOwnProperty.call(KINDS, key) ? KINDS[key] : null;
}

export function isSupportedCategory(category: string | null): boolean {
  "worklet";
  return garmentKind(category) !== null;
}

function pair(keypoints: Keypoint[], joint: Joint): [Point, Point] | null {
  "worklet";
  let left: Keypoint | undefined;
  let right: Keypoint | undefined;
  for (let i = 0; i < keypoints.length; i++) {
    const k = keypoints[i];
    if (!(k.confidence >= MIN_KEYPOINT_CONFIDENCE)) continue;
    if (k.name === `left_${joint}`) left = k;
    else if (k.name === `right_${joint}`) right = k;
  }
  return left && right ? [{ x: left.x, y: left.y }, { x: right.x, y: right.y }] : null;
}

function dist(a: Point, b: Point): number {
  "worklet";
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function mid(a: Point, b: Point): Point {
  "worklet";
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function lerp(a: Point, b: Point, t: number): Point {
  "worklet";
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Row centred on the pair's midpoint, laid along the pair, with the given half-width. */
function rowAt(l: Point, r: Point, half: number): Row {
  "worklet";
  const len = dist(l, r);
  const c = mid(l, r);
  const dx = (r.x - l.x) / len;
  const dy = (r.y - l.y) / len;
  return {
    left: { x: c.x - dx * half, y: c.y - dy * half },
    right: { x: c.x + dx * half, y: c.y + dy * half },
    half,
  };
}

function center(row: Row): Point {
  "worklet";
  return mid(row.left, row.right);
}

function legEdgeRow(p: [Point, Point], hipWidth: number): Row {
  "worklet";
  return rowAt(p[0], p[1], dist(p[0], p[1]) / 2 + LEG_EDGE * hipWidth);
}

/** Unadjusted anchor rows for the category, or null when a pair is missing or unusable. */
function anchorRows(kind: GarmentKind, kps: Keypoint[]): Row[] | null {
  "worklet";
  const hips = pair(kps, "hip");
  if (!hips) return null;
  const hipWidth = dist(hips[0], hips[1]);
  if (!(hipWidth >= MIN_PAIR_WIDTH)) return null;

  if (kind === "bottom") {
    const knees = pair(kps, "knee");
    const ankles = pair(kps, "ankle");
    if (!knees || !ankles) return null;
    if (!(dist(knees[0], knees[1]) >= MIN_PAIR_WIDTH) || !(dist(ankles[0], ankles[1]) >= MIN_PAIR_WIDTH)) return null;
    return [
      rowAt(hips[0], hips[1], (hipWidth * BOTTOM_WIDTH_SCALE) / 2),
      legEdgeRow(knees, hipWidth),
      legEdgeRow(ankles, hipWidth),
    ];
  }

  const shoulders = pair(kps, "shoulder");
  if (!shoulders) return null;
  const shoulderWidth = dist(shoulders[0], shoulders[1]);
  if (!(shoulderWidth >= MIN_PAIR_WIDTH)) return null;
  const topHalf = (shoulderWidth * TOP_WIDTH_SCALE) / 2;
  const hipHalf = Math.max((hipWidth * HIP_WIDTH_SCALE) / 2, topHalf * HIP_MIN_RATIO);
  const top = rowAt(shoulders[0], shoulders[1], topHalf);
  const hipRow = rowAt(hips[0], hips[1], hipHalf);

  if (kind === "upper") {
    const wl = lerp(hips[0], shoulders[0], WAIST_FROM_HIPS);
    const wr = lerp(hips[1], shoulders[1], WAIST_FROM_HIPS);
    // Waist width eases from the hip row toward the top row by the same fraction.
    const waistHalf = hipHalf + (topHalf - hipHalf) * WAIST_FROM_HIPS;
    if (!(dist(wl, wr) >= MIN_PAIR_WIDTH)) return null;
    return [top, rowAt(wl, wr, waistHalf), hipRow];
  }

  const knees = pair(kps, "knee");
  if (!knees || !(dist(knees[0], knees[1]) >= MIN_PAIR_WIDTH)) return null;
  return [top, hipRow, rowAt(knees[0], knees[1], hipHalf * KNEE_WIDTH_SCALE)];
}

function shiftRow(row: Row, dx: number, dy: number): Row {
  "worklet";
  return {
    left: { x: row.left.x + dx, y: row.left.y + dy },
    right: { x: row.right.x + dx, y: row.right.y + dy },
    half: row.half,
  };
}

export function bodyMesh(category: string | null, keypoints: Keypoint[], garment: Bounds): MeshFit {
  "worklet";
  const kind = garmentKind(category);
  if (!kind) return { kind: "unsupported" };

  const rows = anchorRows(kind, keypoints);
  if (!rows) return { kind: "no_pose" };

  const first = center(rows[0]);
  const last = center(rows[rows.length - 1]);
  const span = dist(first, last);
  if (!(span > 0)) return { kind: "no_pose" };
  // Body axis: unit vector from the top-row centre to the bottom-row centre.
  const ax = (last.x - first.x) / span;
  const ay = (last.y - first.y) / span;
  // The body must run down the frame (hips below shoulders); an inverted pose is noise.
  if (!(ay > 0)) return { kind: "no_pose" };

  // Rows must run top to bottom along the body axis, each with a positive width.
  for (let i = 0; i < rows.length; i++) {
    if (!(rows[i].half > 0)) return { kind: "no_pose" };
    if (i < rows.length - 1) {
      const a = center(rows[i]);
      const b = center(rows[i + 1]);
      if (!((b.x - a.x) * ax + (b.y - a.y) * ay > 0)) return { kind: "no_pose" };
    }
  }

  // Every row must run the same way as the top row, or the mesh twists (swapped joints, side-on pose).
  const topDir = { x: rows[0].right.x - rows[0].left.x, y: rows[0].right.y - rows[0].left.y };
  for (let i = 1; i < rows.length; i++) {
    const d = { x: rows[i].right.x - rows[i].left.x, y: rows[i].right.y - rows[i].left.y };
    if (!(d.x * topDir.x + d.y * topDir.y > 0)) return { kind: "no_pose" };
  }

  // Raise the top row (tops/dresses only: bottoms start at the hips) and drop the bottom one.
  const anchors = rows.slice();
  if (kind !== "bottom") {
    const hipCenter = center(rows[kind === "upper" ? 2 : 1]);
    const torso = dist(first, hipCenter);
    // Up = perpendicular to the shoulder line, pointing away from the hips.
    const dl = Math.hypot(topDir.x, topDir.y);
    let ux = -topDir.y / dl;
    let uy = topDir.x / dl;
    const toward = ux * (hipCenter.x - first.x) + uy * (hipCenter.y - first.y);
    if (!(Math.abs(toward) > 0)) return { kind: "no_pose" };
    if (toward > 0) {
      ux = -ux;
      uy = -uy;
    }
    anchors[0] = shiftRow(rows[0], ux * TOP_RAISE * torso, uy * TOP_RAISE * torso);
  }
  const lastIdx = anchors.length - 1;
  anchors[lastIdx] = shiftRow(rows[lastIdx], ax * BOTTOM_DROP * span, ay * BOTTOM_DROP * span);

  const rowCount = lastIdx * STRIPS_PER_SEGMENT + 1;
  const stride = MESH_COLUMNS + 1;
  const vertices: Point[] = [];
  const texCoords: Point[] = [];
  for (let r = 0; r < rowCount; r++) {
    const seg = Math.min(Math.floor(r / STRIPS_PER_SEGMENT), lastIdx - 1);
    const t = (r - seg * STRIPS_PER_SEGMENT) / STRIPS_PER_SEGMENT;
    const left = lerp(anchors[seg].left, anchors[seg + 1].left, t);
    const right = lerp(anchors[seg].right, anchors[seg + 1].right, t);
    const v = garment.y + (r / (rowCount - 1)) * garment.height;
    for (let c = 0; c < stride; c++) {
      const s = c / MESH_COLUMNS;
      vertices.push(lerp(left, right, s));
      texCoords.push({ x: garment.x + s * garment.width, y: v });
    }
  }

  const indices: number[] = [];
  for (let r = 0; r < rowCount - 1; r++) {
    for (let c = 0; c < MESH_COLUMNS; c++) {
      const a = r * stride + c;
      const d = a + stride;
      indices.push(a, a + 1, d, a + 1, d + 1, d);
    }
  }
  // NaN or infinite input must never reach the renderer.
  for (let i = 0; i < vertices.length; i++) {
    if (!Number.isFinite(vertices[i].x) || !Number.isFinite(vertices[i].y)) return { kind: "no_pose" };
  }
  return { kind: "mesh", vertices, texCoords, indices };
}
