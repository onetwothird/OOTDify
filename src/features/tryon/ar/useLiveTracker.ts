// On-device body tracking for the live try-on. Every camera frame runs MoveNet
// in the VisionCamera frame worklet and writes smoothed keypoints, already in
// preview-normalized 0..1 coordinates, to a Reanimated shared value that the
// Skia garment layer reads on the UI thread. Nothing leaves the device and no
// React state changes per frame: the JS side only hears about the person being
// seen, the framing hint and tracker failures, at most every 250 ms.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import { useTensorflowModel, type TensorflowModelDelegate, type TensorflowPlugin } from "react-native-fast-tflite";
import { CommonResolutions, useFrameOutput, type CameraFrameOutput, type Frame } from "react-native-vision-camera";
import { useResizer } from "react-native-vision-camera-resizer";
import { scheduleOnRN } from "react-native-worklets";

import type { TrackerState } from "./liveStatus";
import { framingHint, mirrorSides, type FramingHint } from "./framing";
import { MOVENET_INPUT_SIZE, parseMoveNet } from "./moveNet";
import { MIN_KEYPOINT_CONFIDENCE, pointToPreview, type Keypoint, type Size } from "./overlayGeometry";
import { createSmoother, smoothKeypoints, type SmootherState } from "./smoothing";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL = require("../../../../assets/models/movenet_lightning_int8.tflite") as number;
const GPU: TensorflowModelDelegate[] = ["android-gpu"];
const CPU: TensorflowModelDelegate[] = [];

const MAX_CONSECUTIVE_ERRORS = 30;
const PUSH_INTERVAL_MS = 250;
const STATS_INTERVAL_MS = 2000;
// Captured by value into the worklet: measurement logs only in dev builds.
const IS_DEV = __DEV__;

type Orientation = "up" | "right" | "down" | "left";

/**
 * Worklet-private bookkeeping. It lives on the frame runtime's own global
 * object, so a frame never blocks on another thread to read or write it.
 * `session` ties it to one facing/active session; a new session starts fresh.
 */
interface FrameState {
  session: string;
  smoother: SmootherState;
  errors: number;
  failed: boolean;
  sentSeen: boolean;
  sentHint: FramingHint;
  lastPush: number;
  statsFrames: number;
  statsInferMs: number;
  statsSince: number;
}

interface FrameRuntimeGlobal {
  __ootdifyLiveTracker?: FrameState;
}

function frameStateFor(session: string): FrameState {
  "worklet";
  const g = globalThis as unknown as FrameRuntimeGlobal;
  const existing = g.__ootdifyLiveTracker;
  if (existing && existing.session === session) return existing;
  const fresh: FrameState = {
    session,
    smoother: createSmoother(),
    errors: 0,
    failed: false,
    sentSeen: false,
    sentHint: "no_person",
    lastPush: -Infinity,
    statsFrames: 0,
    statsInferMs: 0,
    statsSince: performance.now(),
  };
  g.__ootdifyLiveTracker = fresh;
  return fresh;
}

/**
 * A MoveNet point (normalized to the square the resizer letterboxed the raw
 * buffer into) → normalized to the upright, output-mirrored frame.
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
  // Undo the resizer's centred "contain" padding to the square.
  const side = Math.max(bufferW, bufferH);
  let u = (x * side - (side - bufferW) / 2) / bufferW;
  let v = (y * side - (side - bufferH) / 2) / bufferH;
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

function logStats(fps: number, inferMs: number, orientation: string, mirrored: boolean, delegate: string) {
  console.log(
    `[LiveTracker] fps=${fps.toFixed(1)} infer=${inferMs.toFixed(1)} orientation=${orientation} mirrored=${mirrored} delegate=${delegate}`,
  );
}

export interface LiveTracker {
  frameOutput: CameraFrameOutput;
  /** Smoothed keypoints, normalized 0..1 of the on-screen preview; null when there is no track. */
  keypoints: SharedValue<Keypoint[] | null>;
  tracker: TrackerState;
  /** Any keypoint scored at least MIN_KEYPOINT_CONFIDENCE recently. */
  personSeen: boolean;
  /** What to tell the user to fix about their framing (unsteadied; see useSteadyHint). */
  hint: FramingHint;
}

export function useLiveTracker({
  active,
  facing,
  preview,
  category,
}: {
  /** False skips inference and clears the track (camera inactive, unsupported garment…). */
  active: boolean;
  facing: "front" | "back";
  /** On-screen preview size, for the cover crop between frame and preview. */
  preview: Size | null;
  /** The garment category, which decides the joints that must be in view. */
  category: string | null;
}): LiveTracker {
  // GPU first; one CPU retry if the GPU delegate fails to load. The GPU error
  // object is remembered so the stale error seen right after switching to the
  // CPU is not mistaken for the CPU attempt failing.
  const [delegates, setDelegates] = useState(GPU);
  const [gpuError, setGpuError] = useState<TensorflowPlugin | null>(null);
  const plugin = useTensorflowModel(MODEL, delegates);
  if (plugin.state === "error" && delegates === GPU) {
    setGpuError(plugin);
    setDelegates(CPU);
  }
  const modelFailed = plugin.state === "error" && delegates === CPU && plugin !== gpuError;
  const model = plugin.state === "loaded" ? plugin.model : undefined;
  const delegateName = delegates === GPU ? "gpu" : "cpu";

  const resizerState = useResizer({
    width: MOVENET_INPUT_SIZE,
    height: MOVENET_INPUT_SIZE,
    channelOrder: "rgb",
    dataType: "uint8",
    scaleMode: "contain",
    pixelLayout: "interleaved",
  });
  const resizer = resizerState.resizer;

  const keypoints = useSharedValue<Keypoint[] | null>(null);

  // Reports carry their session, so one from before a camera flip is ignored.
  const session = `${facing}:${active ? "on" : "off"}`;
  const [seen, setSeen] = useState<{ session: string; value: boolean; hint: FramingHint }>({
    session: "",
    value: false,
    hint: "no_person",
  });
  const [frameError, setFrameError] = useState<string | null>(null);
  const report = useCallback((from: string, value: boolean, hint: FramingHint, error: string | null) => {
    setSeen({ session: from, value, hint });
    if (error !== null) setFrameError(error);
  }, []);

  const failure = modelFailed
    ? `model failed to load: ${plugin.state === "error" ? plugin.error?.message : "unknown error"}`
    : resizerState.state === "error"
      ? `resizer failed: ${resizerState.error.message}`
      : frameError !== null
        ? `${MAX_CONSECUTIVE_ERRORS} frames failed in a row: ${frameError}`
        : null;
  const failed = failure !== null;

  useEffect(() => {
    if (failure !== null) console.warn(`Live tracker failed (${failure}).`);
  }, [failure]);

  // No track while inactive, failed or after a flip: the garment layer then
  // runs its normal hold-and-fade instead of freezing on the last pose.
  useEffect(() => {
    keypoints.value = null;
  }, [session, failed, keypoints]);

  const running = active && !failed && model != null && resizer != null;

  const onFrame = useMemo(() => {
    const size = preview;
    return (frame: Frame) => {
      "worklet";
      let resized: { dispose: () => void; getPixelBuffer: () => ArrayBuffer } | undefined;
      try {
        if (!running || model == null || resizer == null) return;
        if (size == null || size.width <= 0 || size.height <= 0) return;
        const state = frameStateFor(session);
        if (state.failed) return;
        try {
          const t0 = performance.now();
          resized = resizer.resize(frame);
          const out = model.runSync([resized.getPixelBuffer()]);
          const inferMs = performance.now() - t0;
          const raw = parseMoveNet(new Float32Array(out[0]));
          const orientation = frame.orientation as Orientation;
          const swap = orientation === "left" || orientation === "right";
          const upright = swap
            ? { width: frame.height, height: frame.width }
            : { width: frame.width, height: frame.height };
          let personSeen = false;
          const placed: Keypoint[] = [];
          for (let i = 0; i < raw.length; i++) {
            const k = raw[i];
            if (k.confidence >= MIN_KEYPOINT_CONFIDENCE) personSeen = true;
            const p = toUprightFrame(k.x, k.y, frame.width, frame.height, orientation, frame.isMirrored);
            const px = pointToPreview(p, upright, size, false);
            placed.push({ name: k.name, x: px.x / size.width, y: px.y / size.height, confidence: k.confidence });
          }
          const now = performance.now();
          const smoothed = smoothKeypoints(state.smoother, placed, now);
          keypoints.value = smoothed;
          // Left/right are in the user's terms only on the mirrored (front) preview.
          const framed = framingHint(category, smoothed);
          const hint = frame.isMirrored ? framed : mirrorSides(framed);
          state.errors = 0;
          if ((personSeen !== state.sentSeen || hint !== state.sentHint) && now - state.lastPush >= PUSH_INTERVAL_MS) {
            state.sentSeen = personSeen;
            state.sentHint = hint;
            state.lastPush = now;
            scheduleOnRN(report, session, personSeen, hint, null);
          }
          if (IS_DEV) {
            state.statsFrames += 1;
            state.statsInferMs += inferMs;
            const elapsed = now - state.statsSince;
            if (elapsed >= STATS_INTERVAL_MS) {
              scheduleOnRN(
                logStats,
                (state.statsFrames * 1000) / elapsed,
                state.statsInferMs / state.statsFrames,
                orientation,
                frame.isMirrored,
                delegateName,
              );
              state.statsFrames = 0;
              state.statsInferMs = 0;
              state.statsSince = now;
            }
          }
        } catch (e) {
          state.errors += 1;
          if (state.errors >= MAX_CONSECUTIVE_ERRORS) {
            state.failed = true;
            keypoints.value = null;
            scheduleOnRN(report, session, false, "no_person", String(e));
          }
        }
      } finally {
        resized?.dispose();
        frame.dispose();
      }
    };
  }, [running, model, resizer, preview, session, category, keypoints, report, delegateName]);

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_16_9,
    pixelFormat: "rgb",
    enablePhysicalBufferRotation: true,
    dropFramesWhileBusy: true,
    onFrameDropped: () => {
      // Expected while inference runs; the default handler would warn per frame.
    },
    onFrame,
  });

  const tracker: TrackerState = failed ? "failed" : model != null && resizer != null ? "ready" : "loading";
  const personSeen = tracker === "ready" && seen.session === session && seen.value;

  const hint: FramingHint = tracker === "ready" && seen.session === session ? seen.hint : "no_person";

  return { frameOutput, keypoints, tracker, personSeen, hint };
}
