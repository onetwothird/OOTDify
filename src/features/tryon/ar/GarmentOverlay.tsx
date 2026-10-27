// The garment image laid over the live camera preview, gliding between pose
// updates. `rect` is in preview pixels; null hides it.
import { Image } from "expo-image";
import { Animated, StyleSheet } from "react-native";

import { useReduceMotion } from "../../../shared/hooks/useReduceMotion";
import type { Rect } from "./overlayGeometry";
import { useGlide } from "./useGlide";

const AnimatedImage = Animated.createAnimatedComponent(Image);

export function GarmentOverlay({
  imageUrl,
  rect,
  faded,
}: {
  imageUrl: string;
  rect: Rect | null;
  faded: boolean;
}) {
  const reduce = useReduceMotion();
  // A null rect holds the last box while fading out, so the image doesn't
  // shrink to a corner.
  const left = useGlide(rect?.x ?? null, reduce);
  const top = useGlide(rect?.y ?? null, reduce);
  const width = useGlide(rect?.width ?? null, reduce);
  const height = useGlide(rect?.height ?? null, reduce);
  const opacity = useGlide(rect ? (faded ? 0.35 : 0.85) : 0, reduce, 250);

  return (
    <AnimatedImage
      accessible={false}
      pointerEvents="none"
      source={{ uri: imageUrl }}
      contentFit="fill"
      style={[styles.image, { left, top, width, height, opacity }]}
    />
  );
}

const styles = StyleSheet.create({
  image: { position: "absolute" },
});
