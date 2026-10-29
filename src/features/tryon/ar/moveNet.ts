// Parses MoveNet SinglePose Lightning output ([1,1,17,3] as y, x, score).
import type { Keypoint } from "./overlayGeometry";

export const MOVENET_KEYPOINTS: readonly string[] = [
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
];

export const MOVENET_INPUT_SIZE = 192;

const VALUES_PER_POINT = 3;
const EXPECTED_LENGTH = 17 * VALUES_PER_POINT;

export function parseMoveNet(output: ArrayLike<number>): Keypoint[] {
  "worklet";
  if (output.length < EXPECTED_LENGTH) {
    throw new Error(`MoveNet output too short: expected ${EXPECTED_LENGTH} values, got ${output.length}`);
  }
  const result: Keypoint[] = [];
  for (let i = 0; i < 17; i++) {
    const base = i * VALUES_PER_POINT;
    result.push({
      name: MOVENET_KEYPOINTS[i],
      x: output[base + 1],
      y: output[base],
      confidence: output[base + 2],
    });
  }
  return result;
}
