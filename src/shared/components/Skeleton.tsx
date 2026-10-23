// C:\OOTDify\src\shared\components\Skeleton.tsx
// Pulsing placeholder used for image blocks and text lines while real data
// loads. Pure RN Animated — no extra deps, works on every platform.
import { useEffect, useState } from "react";
import {
  Animated,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = "100%", height, radius, style }: SkeletonProps) {
  const styles = useStyles();
  const theme = useAppTheme();
  // Lazy-initialized in useState (not useRef().current) so no ref is read during render.
  const [pulse] = useState(() => new Animated.Value(0.45));

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
        { width, borderRadius: radius ?? theme.borderRadius.sm, opacity: pulse },
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
  const styles = useStyles();
  const theme = useAppTheme();
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
  radius,
}: {
  aspectRatio?: number;
  radius?: number;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  return <Skeleton style={[styles.block, { aspectRatio, borderRadius: radius ?? theme.borderRadius.lg }]} />;
}

const useStyles = makeStyles((theme) => ({
  base: { backgroundColor: theme.colors.surfaceAlt },
  block: { width: "100%", backgroundColor: theme.colors.surfaceAlt },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
  },
  cardMeta: { padding: 10, gap: 8 },
}));