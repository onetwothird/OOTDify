// On-device body tracking for the live try-on. Every camera frame runs MoveNet
// in the VisionCamera frame worklet and writes smoothed keypoints, already in
// preview-normalized 0..1 coordinates, to a Reanimated shared value that the
// Skia garment layer reads on the UI thread. Nothing leaves the device and no
// React state changes per frame: the JS side only hears about the person being
// seen and tracker failures, at most every 250 ms.
import { useCallback, useEffect, useState } from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import { useTensorflowModel, type TensorflowModelDelegate } from "react-native-fast-tflite";
import { CommonResolutions, useFrameOutput, type CameraFrameOutput } from "react-native-vision-camera";
import { useResizer } from "react-native-vision-camera-resizer";
import { scheduleOnRN } from "react-native-worklets";

import type { TrackerState } from "./liveStatus";
import { MOVENET_INPUT_SIZE, parseMoveNet } from "./moveNet";
import { MIN_KEYPOINT_CONFIDENCE, pointToPreview, type Keypoint, type Size } from "./overlayGeometry";
import { createSmoother, smoothKeypoints, type SmootherState } from "./smoothing";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL = require("../../../../assets/models/movenet_lightning_int8.tflite") as number;
const GPU: TensorflowModelDelegate[] = ["android-gpu"];
const CPU: TensorflowModelDelegate[] = [];

const MAX_CONSECUTIVE_ERRORS = 30;
const PUSH_INTERVAL_MS = 250;

type Orientation = "up" | "right" | "down" | "left";

/** Worklet-private bookkeeping, kept in one shared value so a frame reads and writes it once. */
interface FrameState {
  smoother: SmootherState;
  errors: number;
  failed: boolean;
  sentSeen: boolean;
  lastPush: number;
}

function initialFrameState(): FrameState {
  "worklet";
  return { smoother: createSmoother(), errors: 0, failed: false, sentSeen: false, lastPush: -Infinity };
}

/**
 * A MoveNet point (normalized to the centred square the resizer cropped from
 * the raw buffer) → normalized to the upright, output-mirrored frame.
 * With physical buffer rotation the orientation is always "up"; the other
 * cases are a fallback. "right" means the pixels are rotated +90° (clockwise).
 */
function toUprightFrame(
  x: number,
  y: number,
  bufferW: number,
  bufferH: number,
  orientation: Orientation,
  mirrored: boolean,
): { x: number; y: number } {
  "worklet";
  // Undo the resizer's centred "cover" crop to the square.
  const side = Math.min(bufferW, bufferH);
  let u = ((bufferW - side) / 2 + x * side) / bufferW;
  let v = ((bufferH - side) / 2 + y * side) / bufferH;
  if (orientation === "right") {
    const t = u;
    u = v;
    v = 1 - t;
  } else if (orientation === "left") {
    const t = u;
    u = 1 - v;
    v = t;
  } else if (orientation === "down") {
    u = 1 - u;
    v = 1 - v;
  }
  // isMirrored: the output (like the preview) is mirrored but the pixels are not.
  if (mirrored) u = 1 - u;
  return { x: u, y: v };
}

export interface LiveTracker {
  frameOutput: CameraFrameOutput;
  /** Smoothed keypoints, normalized 0..1 of the on-screen preview; null before the first frame. */
  keypoints: SharedValue<Keypoint[] | null>;
  tracker: TrackerState;
  /** Any keypoint scored at least MIN_KEYPOINT_CONFIDENCE recently. */
  personSeen: boolean;
}

export function useLiveTracker({
  active,
  facing,
  preview,
}: {
  /** False skips inference (e.g. unsupported garment); the camera keeps running. */
  active: boolean;
  facing: "front" | "back";
  /** On-screen preview size, for the cover crop between frame and preview. */
  preview: Size | null;
}): LiveTracker {
  // GPU first; one CPU retry if the GPU delegate fails to load.
  const [delegates, setDelegates] = useState(GPU);
  const plugin = useTensorflowModel(MODEL, delegates);
  if (plugin.state === "error" && delegates === GPU) setDelegates(CPU);
  const model = plugin.state === "loaded" ? plugin.model : undefined;

  const resizerState = useResizer({
    width: MOVENET_INPUT_SIZE,
    height: MOVENET_INPUT_SIZE,
    channelOrder: "rgb",
    dataType: "uint8",
    scaleMode: "cover",
    pixelLayout: "interleaved",
  });
  const resizer = resizerState.resizer;

  const keypoints = useSharedValue<Keypoint[] | null>(null);
  const frameState = useSharedValue<FrameState>(initialFrameState());
  const previewSize = useSharedValue<Size | null>(preview);

  const [personSeen, setPersonSeen] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  const report = useCallback((seen: boolean, error: string | null) => {
    setPersonSeen(seen);
    if (error !== null) setFrameError(error);
  }, []);

  useEffect(() => {
    previewSize.value = preview;
  }, [preview, previewSize]);

  // A new camera means a new view of the body: drop the old track.
  useEffect(() => {
    frameState.value = initialFrameState();
    keypoints.value = null;
  }, [facing, frameState, keypoints]);

  const running = active && model != null && resizer != null;

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_16_9,
    pixelFormat: "rgb",
    enablePhysicalBufferRotation: true,
    dropFramesWhileBusy: true,
    onFrameDropped: () => {
      // Expected while inference runs; the default handler would warn per frame.
    },
    onFrame(frame) {
      "worklet";
      let resized: { dispose: () => void; getPixelBuffer: () => ArrayBuffer } | undefined;
      try {
        if (!running || model == null || resizer == null) return;
        const size = previewSize.value;
        if (size == null || size.width <= 0 || size.height <= 0) return;
        const state = frameState.value;
        if (state.failed) return;
        try {
          resized = resizer.resize(frame);
          const out = model.runSync([resized.getPixelBuffer()]);
          const raw = parseMoveNet(new Float32Array(out[0]));
          const orientation = frame.orientation as Orientation;
          const swap = orientation === "left" || orientation === "right";
          const upright = swap
            ? { width: frame.height, height: frame.width }
            : { width: frame.width, height: frame.height };
          let seen = false;
          const placed: Keypoint[] = [];
          for (let i = 0; i < raw.length; i++) {
            const k = raw[i];
            if (k.confidence >= MIN_KEYPOINT_CONFIDENCE) seen = true;
            const p = toUprightFrame(k.x, k.y, frame.width, frame.height, orientation, frame.isMirrored);
            const px = pointToPreview(p, upright, size, false);
            placed.push({ name: k.name, x: px.x / size.width, y: px.y / size.height, confidence: k.confidence });
          }
          const now = performance.now();
          keypoints.value = smoothKeypoints(state.smoother, placed, now);
          state.errors = 0;
          if (seen !== state.sentSeen && now - state.lastPush >= PUSH_INTERVAL_MS) {
            state.sentSeen = seen;
            state.lastPush = now;
            scheduleOnRN(report, seen, null);
          }
        } catch (e) {
          state.errors += 1;
          if (state.errors >= MAX_CONSECUTIVE_ERRORS) {
            state.failed = true;
            scheduleOnRN(report, false, String(e));
          }
        }
        frameState.value = state;
      } finally {
        resized?.dispose();
        frame.dispose();
      }
    },
  });

  const modelFailed = plugin.state === "error" && delegates === CPU;
  const failure = modelFailed
    ? `model failed to load: ${plugin.error?.message ?? "unknown error"}`
    : resizerState.state === "error"
      ? `resizer failed: ${resizerState.error.message}`
      : frameError !== null
        ? `${MAX_CONSECUTIVE_ERRORS} frames failed in a row: ${frameError}`
        : null;

  useEffect(() => {
    if (failure !== null) console.warn(`Live tracker failed (${failure}).`);
  }, [failure]);

  const tracker: TrackerState = 
    failure !== null ? "failed" : model != null && resizer != null ? "ready" : "loading";

  return { frameOutput, keypoints, tracker, personSeen: tracker === "ready" && personSeen };
}
