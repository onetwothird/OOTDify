// Tells the user how to move so the joints every outfit item needs sit inside a
// safe zone of the preview. Pure and native-free so it can run in a worklet.
// Keypoints are in preview coordinates (0..1), after rotation and mirroring.
import type { ItemKind } from "./itemKind";
import { MIN_KEYPOINT_CONFIDENCE, type Keypoint } from "./overlayGeometry";

export type FramingHint = "no_person" | "step_back" | "come_closer" | "move_left" | "move_right" | "good";

export const SAFE_X = 0.06;
export const SAFE_Y = 0.04;
export const MIN_BODY_SPAN = 0.35;

const REQUIRED: Record<ItemKind, string[]> = {
  upper: ["shoulder", "hip"],
  outer: ["shoulder", "hip"],
  dress: ["shoulder", "hip", "knee"],
  bottom: ["hip", "knee", "ankle"],
  hat: ["eye", "ear"],
  glasses: ["eye"],
  earrings: ["ear"],
  necklace: ["shoulder"],
  watch: ["elbow", "wrist"],
  belt: ["hip"],
  bag: ["hip"],
  shoes: ["ankle"],
};

const BODY_ROWS = ["shoulder", "hip", "knee", "ankle"];

/** Swap move_left / move_right, for a preview that isn't mirrored (back camera). */
export function mirrorSides(hint: FramingHint): FramingHint {
  "worklet";
  if (hint === "move_left") return "move_right";
  if (hint === "move_right") return "move_left";
  return hint;
}

export function framingHint(kinds: ItemKind[], keypoints: Keypoint[]): FramingHint {
  "worklet";
  let anyConfident = false;
  for (let i = 0; i < keypoints.length; i++) {
    if (keypoints[i].confidence >= MIN_KEYPOINT_CONFIDENCE) anyConfident = true;
  }
  if (!anyConfident) return "no_person";

  // The union of every item's joints.
  const joints: string[] = [];
  for (let k = 0; k < kinds.length; k++) {
    const need = REQUIRED[kinds[k]];
    for (let j = 0; j < need.length; j++) if (joints.indexOf(need[j]) < 0) joints.push(need[j]);
  }
  if (joints.length === 0) return "good";
  // "Come closer" needs a height to judge by: at least two body rows (e.g. a
  // top's shoulders and hips). A face-only or one-row outfit (hat, belt,
  // shoes, necklace, watch) spans far less than a body, so it is never
  // judged too small.
  let bodyRows = 0;
  for (let j = 0; j < joints.length; j++) if (BODY_ROWS.indexOf(joints[j]) >= 0) bodyRows++;
  const bodyJoint = bodyRows >= 2;

  let offTop = false;
  let offBottom = false;
  let anyOutside = false;
  let leftSide = false; // an outside joint with x < SAFE_X
  let rightSide = false; // an outside joint with x > 1 - SAFE_X
  let otherSide = false; // an outside joint with a known x that is neither
  let minY = Infinity;
  let maxY = -Infinity;

  for (let j = 0; j < joints.length; j++) {
    for (let s = 0; s < 2; s++) {
      const name = `${s === 0 ? "left" : "right"}_${joints[j]}`;
      let found: Keypoint | null = null;
      for (let i = 0; i < keypoints.length; i++) {
        if (keypoints[i].name === name && keypoints[i].confidence >= MIN_KEYPOINT_CONFIDENCE) found = keypoints[i];
      }
      if (!found) {
        anyOutside = true; // missing: no usable position
        continue;
      }
      const { x, y } = found;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const outTop = y < SAFE_Y;
      const outBottom = y > 1 - SAFE_Y;
      const outLeft = x < SAFE_X;
      const outRight = x > 1 - SAFE_X;
      if (outTop) offTop = true;
      if (outBottom) offBottom = true;
      if (outTop || outBottom || outLeft || outRight) {
        anyOutside = true;
        if (outLeft) leftSide = true;
        else if (outRight) rightSide = true;
        else otherSide = true;
      }
    }
  }

  if (anyOutside) {
    if ((offTop && offBottom) || (offBottom && !offTop && joints.indexOf("ankle") < 0)) return "step_back";
    if (!otherSide && leftSide && !rightSide) return "move_right";
    if (!otherSide && rightSide && !leftSide) return "move_left";
    return "step_back";
  }

  if (bodyJoint && !(maxY - minY >= MIN_BODY_SPAN)) return "come_closer";
  return "good";
}
