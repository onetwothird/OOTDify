// Places an accessory cut-out on the tracked body as one or two rigid quads:
// an anchor point, a width scaled to the body, the image's aspect and an angle
// taken from a body line. Pure and native-free so it can run in a worklet.
// Keypoints are in preview coordinates (0..1). Like bodyMesh, image-left goes
// toward the person's left joints; LiveOutfitLayer flips textures on the back
// camera.
import type { Bounds } from "./bodyMesh";
import type { AccessoryKind } from "./itemKind";
import { MIN_KEYPOINT_CONFIDENCE, type Keypoint, type Point } from "./overlayGeometry";

const HAT_WIDTH_PER_EAR = 1.7; // hat width = ear distance x this
const HAT_RAISE_PER_EAR = 0.55; // hat bottom edge sits this many ear distances above the eyes
const HAT_WIDTH_PER_EYE = 2.8; // fallback width without ears
const GLASSES_WIDTH_PER_EYE = 2.3;
const EARRING_WIDTH_PER_EAR = 0.35;
const NECK_TOWARD_NOSE = 0.25; // neck = shoulder midpoint moved this share toward the nose
const NECKLACE_WIDTH_PER_SHOULDER = 0.8;
const WATCH_WIDTH_PER_FOREARM = 0.45;
const BELT_WIDTH_PER_HIP = 1.35;
const BAG_WIDTH_PER_HIP = 0.9;
const SHOE_WIDTH_PER_HIP = 0.5;
const SHOE_PAIR_ASPECT = 1.3; // a shoe photo wider than this x its height shows a pair
const MIN_PAIR_WIDTH = 0.02; // a width-setting pair closer than this (of the frame) is noise

/** Corners in frame-normalized points: top-left, top-right, bottom-right, bottom-left (image orientation). */
export interface Quad {
  corners: [Point, Point, Point, Point];
  /** The part of the cut-out drawn on this quad, normalized 0..1 of the image. */
  tex: Bounds;
  /** Draw the texture flipped left to right. */
  mirror: boolean;
}

export type AccessoryFit = { kind: "quads"; quads: Quad[] } | { kind: "no_pose" };

type Edge = "top" | "center" | "bottom";

const NO_POSE: AccessoryFit = { kind: "no_pose" };

function joint(keypoints: Keypoint[], name: string): Point | null {
  "worklet";
  for (let i = 0; i < keypoints.length; i++) {
    const k = keypoints[i];
    if (k.name === name && k.confidence >= MIN_KEYPOINT_CONFIDENCE && Number.isFinite(k.x) && Number.isFinite(k.y)) {
      return { x: k.x, y: k.y };
    }
  }
  return null;
}

/** Both sides of a joint, far enough apart to set a width and a direction. */
function pair(keypoints: Keypoint[], name: string): [Point, Point] | null {
  "worklet";
  const l = joint(keypoints, `left_${name}`);
  const r = joint(keypoints, `right_${name}`);
  if (!l || !r || !(dist(l, r) >= MIN_PAIR_WIDTH)) return null;
  return [l, r];
}

function dist(a: Point, b: Point): number {
  "worklet";
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function mid(a: Point, b: Point): Point {
  "worklet";
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Unit vector from a to b (a and b are a validated pair, so never zero length). */
function unit(a: Point, b: Point): Point {
  "worklet";
  const d = dist(a, b);
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
}

/**
 * Perpendicular to `right`, pointing down the frame. `right` runs from the
 * person's left joint to their right one, which points screen-left on the
 * back camera (unmirrored), so "down" can't be a fixed quarter turn of it.
 */
function downOf(right: Point): Point {
  "worklet";
  const d = { x: -right.y, y: right.x };
  return d.y < 0 || (d.y === 0 && d.x < 0) ? { x: -d.x, y: -d.y } : d;
}

/**
 * A quad of `width` along `right` (a unit vector), its height from the
 * texture's aspect, with the given edge's centre at `anchor`.
 */
function quad(anchor: Point, edge: Edge, width: number, right: Point, tex: Bounds, mirror: boolean): Quad {
  "worklet";
  const height = (width * tex.height) / tex.width;
  const down = downOf(right);
  const shift = edge === "top" ? 0 : edge === "center" ? height / 2 : height;
  const tc = { x: anchor.x - down.x * shift, y: anchor.y - down.y * shift };
  const hx = (right.x * width) / 2;
  const hy = (right.y * width) / 2;
  const tl = { x: tc.x - hx, y: tc.y - hy };
  const tr = { x: tc.x + hx, y: tc.y + hy };
  return {
    corners: [tl, tr, { x: tr.x + down.x * height, y: tr.y + down.y * height }, { x: tl.x + down.x * height, y: tl.y + down.y * height }],
    tex,
    mirror,
  };
}

function fit(quads: Quad[]): AccessoryFit {
  "worklet";
  for (let i = 0; i < quads.length; i++) {
    const c = quads[i].corners;
    for (let j = 0; j < 4; j++) {
      if (!Number.isFinite(c[j].x) || !Number.isFinite(c[j].y)) return NO_POSE;
    }
  }
  return { kind: "quads", quads };
}

export function accessoryFit(kind: AccessoryKind, keypoints: Keypoint[], garment: Bounds): AccessoryFit {
  "worklet";
  if (!(garment.width > 0) || !(garment.height > 0)) return NO_POSE;

  if (kind === "hat" || kind === "glasses") {
    const eyes = pair(keypoints, "eye");
    if (!eyes) return NO_POSE;
    const right = unit(eyes[0], eyes[1]);
    const center = mid(eyes[0], eyes[1]);
    const eyeDist = dist(eyes[0], eyes[1]);
    if (kind === "glasses") return fit([quad(center, "center", GLASSES_WIDTH_PER_EYE * eyeDist, right, garment, false)]);
    const ears = pair(keypoints, "ear");
    const width = ears ? HAT_WIDTH_PER_EAR * dist(ears[0], ears[1]) : HAT_WIDTH_PER_EYE * eyeDist;
    // Raised along "up", away from the face.
    const raise = ears ? HAT_RAISE_PER_EAR * dist(ears[0], ears[1]) : (HAT_RAISE_PER_EAR * width) / HAT_WIDTH_PER_EAR;
    const down = downOf(right);
    const anchor = { x: center.x - down.x * raise, y: center.y - down.y * raise };
    return fit([quad(anchor, "bottom", width, right, garment, false)]);
  }

  if (kind === "earrings") {
    const ears = pair(keypoints, "ear");
    if (!ears) return NO_POSE;
    const right = unit(ears[0], ears[1]);
    const width = EARRING_WIDTH_PER_EAR * dist(ears[0], ears[1]);
    return fit([quad(ears[0], "top", width, right, garment, false), quad(ears[1], "top", width, right, garment, false)]);
  }

  if (kind === "necklace") {
    const shoulders = pair(keypoints, "shoulder");
    const nose = joint(keypoints, "nose");
    if (!shoulders || !nose) return NO_POSE;
    const sm = mid(shoulders[0], shoulders[1]);
    const neck = { x: sm.x + (nose.x - sm.x) * NECK_TOWARD_NOSE, y: sm.y + (nose.y - sm.y) * NECK_TOWARD_NOSE };
    const width = NECKLACE_WIDTH_PER_SHOULDER * dist(shoulders[0], shoulders[1]);
    return fit([quad(neck, "top", width, unit(shoulders[0], shoulders[1]), garment, false)]);
  }

  if (kind === "watch") {
    const elbow = joint(keypoints, "left_elbow");
    const wrist = joint(keypoints, "left_wrist");
    if (!elbow || !wrist || !(dist(elbow, wrist) >= MIN_PAIR_WIDTH)) return NO_POSE;
    const along = unit(elbow, wrist);
    // The strap runs across the forearm.
    const right = { x: along.y, y: -along.x };
    return fit([quad(wrist, "center", WATCH_WIDTH_PER_FOREARM * dist(elbow, wrist), right, garment, false)]);
  }

  // Belt, bag and shoes: sized and turned by the hips.
  const hips = pair(keypoints, "hip");
  if (!hips) return NO_POSE;
  const hipWidth = dist(hips[0], hips[1]);
  const right = unit(hips[0], hips[1]);

  if (kind === "belt") return fit([quad(mid(hips[0], hips[1]), "center", BELT_WIDTH_PER_HIP * hipWidth, right, garment, false)]);
  if (kind === "bag") return fit([quad(hips[1], "top", BAG_WIDTH_PER_HIP * hipWidth, right, garment, false)]);

  const leftAnkle = joint(keypoints, "left_ankle");
  const rightAnkle = joint(keypoints, "right_ankle");
  if (!leftAnkle || !rightAnkle) return NO_POSE;
  const width = SHOE_WIDTH_PER_HIP * hipWidth;
  if (garment.width > SHOE_PAIR_ASPECT * garment.height) {
    const half = garment.width / 2;
    const leftTex = { x: garment.x, y: garment.y, width: half, height: garment.height };
    const rightTex = { x: garment.x + half, y: garment.y, width: half, height: garment.height };
    return fit([quad(leftAnkle, "top", width, right, leftTex, false), quad(rightAnkle, "top", width, right, rightTex, false)]);
  }
  return fit([quad(leftAnkle, "top", width, right, garment, false), quad(rightAnkle, "top", width, right, garment, true)]);
}

/** Two triangles per quad. texCoords are normalized 0..1 of the image; `mirror` flips x inside `tex`. */
export function quadsToMesh(quads: Quad[]): { vertices: Point[]; texCoords: Point[]; indices: number[] } {
  "worklet";
  const vertices: Point[] = [];
  const texCoords: Point[] = [];
  const indices: number[] = [];
  for (let i = 0; i < quads.length; i++) {
    const { corners, tex, mirror } = quads[i];
    const left = mirror ? tex.x + tex.width : tex.x;
    const right = mirror ? tex.x : tex.x + tex.width;
    const top = tex.y;
    const bottom = tex.y + tex.height;
    const b = i * 4;
    vertices.push(corners[0], corners[1], corners[2], corners[3]);
    texCoords.push({ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom });
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { vertices, texCoords, indices };
}
