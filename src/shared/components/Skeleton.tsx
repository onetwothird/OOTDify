// C:\OOTDify\src\shared\components\Skeleton.tsx
// Pulsing placeholder used for image blocks and text lines while real data
// loads. Pure RN Animated — no extra deps, works on every platform.
import { useEffect, useRef } from "react";
import {
  Animated,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { theme } from "../config/theme";

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = "100%", height, radius = theme.borderRadius.sm, style }: SkeletonProps) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.base,
        { width, borderRadius: radius, opacity: pulse },
        height ? { height } : null,
        style,
      ]}
    />
  );
}

/** Card-shaped skeleton sized like a grid tile (with or without text lines). */
export function SkeletonCard({
  width,
  withMeta = true,
}: {
  width: number;
  withMeta?: boolean;
}) {
  return (
    <View style={[styles.card, { width }]}>
      <Skeleton height={width / 0.8} radius={theme.borderRadius.md} />
      {withMeta ? (
        <View style={styles.cardMeta}>
          <Skeleton width="82%" height={13} />
          <Skeleton width="48%" height={11} />
        </View>
      ) : null}
    </View>
  );
}

/** Image-frame skeleton that pulses as a block (hero / results). */
export function SkeletonBlock({
  aspectRatio = 1,
  radius = theme.borderRadius.lg,
}: {
  aspectRatio?: number;
  radius?: number;
}) {
  return <Skeleton style={[styles.block, { aspectRatio, borderRadius: radius }]} />;
}

const styles = StyleSheet.create({
  base: { backgroundColor: "#E2DED4" },
  block: { width: "100%", backgroundColor: "#E2DED4" },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
  },
  cardMeta: { padding: 10, gap: 8 },
});