// Draws the whole outfit over the camera preview on one Skia canvas. Runs on
// the UI thread from shared values: keypoints (preview coordinates, from
// useLiveTracker) → one fit pass per tracker frame → per item a stretch mesh
// (bodyMesh, clothing) or rigid quads (accessoryFit) → a Skia <Vertices>
// textured with that item's cut-out, in layer order (outfit.ts). When an
// item's pose is lost its last mesh holds for 300 ms, then fades over 200 ms
// (no fade with reduce motion). On the back camera textures are flipped so
// logos read the right way; the front camera is a mirror.
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
import { useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import {
  useAnimatedReaction,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { accessoryFit, quadsToMesh } from "./accessoryFit";
import { alphaBounds } from "./alphaBounds";
import { meshFit, type Bounds } from "./bodyMesh";
import { isMeshKind, type ItemKind } from "./itemKind";
import { layerIndex } from "./outfit";
import type { Keypoint, Point } from "./overlayGeometry";

const OPACITY = 0.95;
const HOLD_MS = 300;
const FADE_MS = 200;
const BOUNDS_MAX_SIDE = 128;
const FULL_BOUNDS: Bounds = { x: 0, y: 0, width: 1, height: 1 };

/** Vertices normalized to the frame, texCoords normalized 0..1 of the image. */
interface ItemMesh {
  vertices: Point[];
  texCoords: Point[];
  indices: number[];
}

/** One drawable outfit item: a placeable kind with a loaded cut-out. */
export interface OutfitLayerItem {
  id: string;
  kind: ItemKind;
  image: SkImage;
  bounds: Bounds;
}

// A degenerate triangle: <Vertices> always gets valid input but draws nothing.
const EMPTY_POINTS: SkPoint[] = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
];
const EMPTY_INDICES = [0, 1, 2];

/** Opaque bounds of a cut-out, from a copy scaled to at most 128 px; full bounds if unreadable. */
export function garmentBounds(image: SkImage): Bounds {
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
}

/**
 * Decodes the cut-out PNGs. Each uri maps to its image, or "failed" once it
 * can't be read; an absent uri is still loading.
 */
export function useSkImages(uris: string[]): Record<string, SkImage | "failed"> {
  const [images, setImages] = useState<Record<string, SkImage | "failed">>({});
  const key = uris.join("\n");
  useEffect(() => {
    let cancelled = false;
    for (const uri of key === "" ? [] : key.split("\n")) {
      Skia.Data.fromURI(uri)
        .then((data) => Skia.Image.MakeImageFromEncoded(data) ?? ("failed" as const))
        .catch((e: unknown) => {
          console.warn("Cut-out image failed to load:", e);
          return "failed" as const;
        })
        .then((image) => {
          if (!cancelled) setImages((prev) => ({ ...prev, [uri]: image }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [key]);
  return images;
}

export function LiveOutfitLayer({
  items,
  keypoints,
  facing,
}: {
  items: OutfitLayerItem[];
  keypoints: SharedValue<Keypoint[] | null>;
  facing: "front" | "back";
}) {
  const canvasSize = useSharedValue<SkSize>({ width: 0, height: 0 });
  const ordered = useMemo(() => [...items].sort((a, b) => layerIndex(a.kind) - layerIndex(b.kind)), [items]);
  // Plain data for the worklet: the fit needs each item's kind and opaque bounds.
  const specs = useMemo(() => ordered.map((i) => ({ kind: i.kind, bounds: i.bounds })), [ordered]);

  // Per item: the last good mesh and when its pose was lost (-1 while tracked).
  const held = useSharedValue<(ItemMesh | null)[]>([]);
  const lostAt = useSharedValue<number[]>([]);

  // One fit pass per tracker frame for the whole outfit.
  useAnimatedReaction(
    () => keypoints.value,
    (kps) => {
      const now = performance.now();
      const nextHeld: (ItemMesh | null)[] = [];
      const nextLost: number[] = [];
      for (let i = 0; i < specs.length; i++) {
        const { kind, bounds } = specs[i];
        let mesh: ItemMesh | null = null;
        if (isMeshKind(kind)) {
          const fit = meshFit(kind, kps ?? [], bounds);
          if (fit.kind === "mesh") mesh = fit;
        } else {
          const fit = accessoryFit(kind, kps ?? [], bounds);
          if (fit.kind === "quads") mesh = quadsToMesh(fit.quads);
        }
        const prevMesh = i < held.value.length ? held.value[i] : null;
        const prevLost = i < lostAt.value.length ? lostAt.value[i] : -1;
        if (mesh) {
          nextHeld.push(mesh);
          nextLost.push(-1);
        } else {
          nextHeld.push(prevMesh);
          nextLost.push(prevMesh !== null && prevLost < 0 ? now : prevLost);
        }
      }
      held.value = nextHeld;
      lostAt.value = nextLost;
    },
    [specs],
  );

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none" onSize={canvasSize}>
      {ordered.map((item, index) => (
        <OutfitItem
          key={item.id}
          index={index}
          image={item.image}
          bounds={item.bounds}
          held={held}
          lostAt={lostAt}
          canvasSize={canvasSize}
          flip={facing === "back"}
        />
      ))}
    </Canvas>
  );
}

function OutfitItem({
  index,
  image,
  bounds,
  held,
  lostAt,
  canvasSize,
  flip,
}: {
  index: number;
  image: SkImage;
  bounds: Bounds;
  held: SharedValue<(ItemMesh | null)[]>;
  lostAt: SharedValue<number[]>;
  canvasSize: SharedValue<SkSize>;
  flip: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const clock = useClock();
  const imageW = image.width();
  const imageH = image.height();

  const opacity = useDerivedValue(() => {
    // Reading the clock re-evaluates every frame while the fade runs.
    const now = clock.value >= 0 ? performance.now() : 0;
    const mesh = index < held.value.length ? held.value[index] : null;
    if (mesh === null) return 0;
    const lost = lostAt.value[index];
    if (lost < 0) return OPACITY;
    const elapsed = now - lost;
    if (elapsed < HOLD_MS) return OPACITY;
    if (reduceMotion) return 0;
    return OPACITY * Math.max(0, 1 - (elapsed - HOLD_MS) / FADE_MS);
  });

  const vertices = useDerivedValue<SkPoint[]>(() => {
    const mesh = index < held.value.length ? held.value[index] : null;
    const { width, height } = canvasSize.value;
    if (!mesh || width <= 0) return EMPTY_POINTS;
    return mesh.vertices.map((p) => ({ x: p.x * width, y: p.y * height }));
  });
  const textures = useDerivedValue<SkPoint[]>(() => {
    const mesh = index < held.value.length ? held.value[index] : null;
    if (!mesh || canvasSize.value.width <= 0) return EMPTY_POINTS;
    // Fits put image-left on the person's left joints; seen from the back
    // camera that reverses the item, so mirror x within the opaque bounds.
    return mesh.texCoords.map((p) => ({
      x: (flip ? bounds.x + bounds.width - (p.x - bounds.x) : p.x) * imageW,
      y: p.y * imageH,
    }));
  });
  const indices = useDerivedValue<number[]>(() => {
    const mesh = index < held.value.length ? held.value[index] : null;
    return mesh && canvasSize.value.width > 0 ? mesh.indices : EMPTY_INDICES;
  });

  return (
    <Vertices vertices={vertices} textures={textures} indices={indices} mode="triangles" opacity={opacity} antiAlias>
      <ImageShader image={image} sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.None }} />
    </Vertices>
  );
}
