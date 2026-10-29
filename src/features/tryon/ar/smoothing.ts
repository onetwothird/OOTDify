// One-Euro filter (Casiez et al.) that removes jitter from MoveNet keypoints.
import { MIN_KEYPOINT_CONFIDENCE, type Keypoint } from "./overlayGeometry";

export const MIN_CUTOFF = 1.0;
export const BETA = 0.02;
export const D_CUTOFF = 1.0;
// Keypoints are normalised 0..1, so speed is measured in percent of the frame per
// second. Without this BETA (tuned for pixel-scale signals) would never open the cutoff.
const SPEED_SCALE = 100;

// Plain serialisable state, keyed by joint name, safe to hold in a worklet-shared value.
export interface AxisState {
  x: number; // last filtered value
  dx: number; // last filtered derivative
  raw: number; // last raw value
}

export interface SmootherState {
  lastT: Record<string, number>;
  axes: Record<string, AxisState>;
}

export function createSmoother(): SmootherState {
  "worklet";
  return { lastT: {}, axes: {} };
}

function alpha(cutoff: number, dt: number): number {
  "worklet";
  return 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
}

function filterAxis(state: SmootherState, key: string, value: number, dt: number): number {
  "worklet";
  const prev = state.axes[key];
  if (!prev) {
    state.axes[key] = { x: value, dx: 0, raw: value };
    return value;
  }
  const rate = ((value - prev.raw) * SPEED_SCALE) / dt;
  const dxHat = prev.dx + alpha(D_CUTOFF, dt) * (rate - prev.dx);
  const cutoff = MIN_CUTOFF + BETA * Math.abs(dxHat);
  const xHat = prev.x + alpha(cutoff, dt) * (value - prev.x);
  state.axes[key] = { x: xHat, dx: dxHat, raw: value };
  return xHat;
}

export function smoothKeypoints(state: SmootherState, keypoints: Keypoint[], tMs: number): Keypoint[] {
  "worklet";
  return keypoints.map((k) => {
    const xKey = `${k.name}.x`;
    const yKey = `${k.name}.y`;
    if (k.confidence < MIN_KEYPOINT_CONFIDENCE) {
      delete state.axes[xKey];
      delete state.axes[yKey];
      delete state.lastT[k.name];
      return { name: k.name, x: k.x, y: k.y, confidence: k.confidence };
    }
    const last = state.lastT[k.name];
    // Guard against a zero or negative gap between frames.
    const dt = last === undefined ? 1 / 30 : Math.max((tMs - last) / 1000, 1e-3);
    state.lastT[k.name] = tMs;
    return {
      name: k.name,
      x: filterAxis(state, xKey, k.x, dt),
      y: filterAxis(state, yKey, k.y, dt),
      confidence: k.confidence,
    };
  });
}
