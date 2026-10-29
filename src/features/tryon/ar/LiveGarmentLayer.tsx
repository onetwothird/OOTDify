// Draws the garment cut-out warped onto the tracked body, over the camera
// preview. Runs on the UI thread from shared values: keypoints (preview
// coordinates, from useLiveTracker) → bodyMesh → Skia <Vertices> textured with
// the cut-out. When the pose is lost the last mesh holds for 300 ms, then
// fades over 200 ms (no fade with reduce motion). On the back camera the
// texture is flipped so logos read the right way; the front camera is a mirror.
import {
  AlphaType,
  Canvas,
  ColorType,
  FilterMode,
  ImageShader,
  MipmapMode,
  Skia,
  useClock,
  Vertices,
  type SkImage,
  type SkPoint,
  type SkSize,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useAnimatedReaction, useDerivedValue, useReducedMotion, useSharedValue, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { alphaBounds } from "./alphaBounds";
import { bodyMesh, type Bounds, type MeshFit } from "./bodyMesh";
import type { Keypoint } from "./overlayGeometry";

const OPACITY = 0.95;
const HOLD_MS = 300;
const FADE_MS = 200;
const PUSH_INTERVAL_MS = 250;
const BOUNDS_MAX_SIDE = 128;
const FULL_BOUNDS: Bounds = { x: 0, y: 0, width: 1, height: 1 };

type Mesh = Extract<MeshFit, { kind: "mesh" }>;

// A degenerate triangle: <Vertices> always gets valid input but draws nothing.
const EMPTY_POINTS: SkPoint[] = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
];
const EMPTY_INDICES = [0, 1, 2];

/** Opaque bounds of the cut-out, from a copy scaled to at most 128 px; full bounds until known. */
export function useGarmentBounds(image: SkImage | null): Bounds {
  return useMemo(() => {
    if (!image) return FULL_BOUNDS;
    try {
      const scale = Math.min(1, BOUNDS_MAX_SIDE / Math.max(image.width(), image.height()));
      const w = Math.max(1, Math.round(image.width() * scale));
      const h = Math.max(1, Math.round(image.height() * scale));
      const surface = Skia.Surface.Make(w, h);
      if (!surface) return FULL_BOUNDS;
      const paint = Skia.Paint();
      surface
        .getCanvas()
        .drawImageRect(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(0, 0, w, h), paint);
      surface.flush();
      const pixels = surface
        .makeImageSnapshot()
        .readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
      if (!(pixels instanceof Uint8Array)) return FULL_BOUNDS;
      return alphaBounds(pixels, w, h);
    } catch (e) {
      console.warn("Garment bounds failed:", e);
      return FULL_BOUNDS;
    }
  }, [image]);
}

export function LiveGarmentLayer({
  image,
  bounds,
  category,
  keypoints,
  facing,
  onFitKind,
}: {
  image: SkImage | null;
  bounds: Bounds;
  category: string | null;
  keypoints: SharedValue<Keypoint[] | null>;
  facing: "front" | "back";
  /** The current fit kind, pushed at most every 250 ms (drives the status line). */
  onFitKind?: (kind: MeshFit["kind"]) => void;
}) {
  const reduceMotion = useReducedMotion();
  const canvasSize = useSharedValue<SkSize>({ width: 0, height: 0 });
  const clock = useClock();
  const imageW = image ? image.width() : 0;
  const imageH = image ? image.height() : 0;

  const held = useSharedValue<Mesh | null>(null);
  const lostAt = useSharedValue(-1);
  const push = useSharedValue({ kind: "", at: -Infinity });

  // Per tracker frame: fit the mesh, remember the last good one, report the kind.
  useAnimatedReaction(
    () => keypoints.value,
    (kps) => {
      const fit = bodyMesh(category, kps ?? [], bounds);
      const now = performance.now();
      if (fit.kind === "mesh") {
        held.value = fit;
        lostAt.value = -1;
      } else if (held.value !== null && lostAt.value < 0) {
        lostAt.value = now;
      }
      const last = push.value;
      if (onFitKind && fit.kind !== last.kind && now - last.at >= PUSH_INTERVAL_MS) {
        push.value = { kind: fit.kind, at: now };
        scheduleOnRN(onFitKind, fit.kind);
      }
    },
    [category, bounds, onFitKind],
  );

  const opacity = useDerivedValue(() => {
    // Reading the clock re-evaluates every frame while the fade runs.
    const now = clock.value >= 0 ? performance.now() : 0;
    if (held.value === null) return 0;
    if (lostAt.value < 0) return OPACITY;
    const elapsed = now - lostAt.value;
    if (elapsed < HOLD_MS) return OPACITY;
    if (reduceMotion) return 0;
    return OPACITY * Math.max(0, 1 - (elapsed - HOLD_MS) / FADE_MS);
  });

  const vertices = useDerivedValue<SkPoint[]>(() => {
    const mesh = held.value;
    const { width, height } = canvasSize.value;
    if (!mesh || width <= 0) return EMPTY_POINTS;
    return mesh.vertices.map((p) => ({ x: p.x * width, y: p.y * height }));
  });
  const textures = useDerivedValue<SkPoint[]>(() => {
    const mesh = held.value;
    if (!mesh || canvasSize.value.width <= 0) return EMPTY_POINTS;
    // bodyMesh puts image-left on the person's left joints; seen from the back
    // camera that reverses the garment, so mirror x within the opaque bounds.
    const flip = facing === "back";
    return mesh.texCoords.map((p) => ({
      x: (flip ? bounds.x + bounds.width - (p.x - bounds.x) : p.x) * imageW,
      y: p.y * imageH,
    }));
  });
  const indices = useDerivedValue<number[]>(() => {
    const mesh = held.value;
    return mesh && canvasSize.value.width > 0 ? mesh.indices : EMPTY_INDICES;
  });

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none" onSize={canvasSize}>
      {image ? (
        <Vertices
          vertices={vertices}
          textures={textures}
          indices={indices}
          mode="triangles"
          opacity={opacity}
          antiAlias
        >
          <ImageShader image={image} sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.None }} />
        </Vertices>
      ) : null}
    </Canvas>
  );
}
