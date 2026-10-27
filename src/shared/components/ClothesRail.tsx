// C:\OOTDify\src\shared\components\ClothesRail.tsx
// The signed-out and legal screens share one visual idea: a clothes rail.
//   * <Pinstripes />  — faint shirting stripes behind the page.
//   * <Rail />        — the rod, with optional rings where strings hang.
//   * useSwing()      — a rotation that swings in once on mount and, if asked,
//                       keeps a gentle out-of-phase sway like real hang-tags.
// Motion is skipped entirely under Reduce Motion. Pure presentation, theme
// tokens only, so it works in light and dark.
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
} from "react-native";

import { makeStyles } from "../theme/makeStyles";

const STRIPE_GAP = 22;

/** Absolute-fill pinstripe backdrop; place it first inside a screen's root. */
export function Pinstripes() {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const count = Math.ceil(width / STRIPE_GAP);
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.stripe, { left: i * STRIPE_GAP + STRIPE_GAP / 2 }]} />
      ))}
    </View>
  );
}

/**
 * The rod. `rings` are horizontal positions (0..1) where a string loops over
 * it, so whatever hangs below reads as actually hung.
 */
export function Rail({
  rings = [],
  style,
}: {
  rings?: number[];
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.rail, style]}>
      <View style={[styles.cap, styles.capLeft]} />
      <View style={[styles.cap, styles.capRight]} />
      {rings.map((at) => (
        <View key={at} style={[styles.ring, { left: `${at * 100}%` }]} />
      ))}
    </View>
  );
}

/**
 * Rotation for something hanging from its top edge (pair it with
 * `transformOrigin: "top"`). Swings from `from` to `rest` degrees once; with
 * `sway`, then drifts ±`sway` degrees around rest, offset by `phase` ms.
 */
export function useSwing({
  from,
  rest,
  sway = 0,
  phase = 0,
  duration = 1100,
}: {
  from: number;
  rest: number;
  sway?: number;
  phase?: number;
  duration?: number;
}) {
  const [swing] = useState(() => new Animated.Value(0));
  const [drift] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let cancelled = false;
    const running: Animated.CompositeAnimation[] = [];
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          swing.setValue(1);
          return;
        }
        const swingIn = Animated.timing(swing, {
          toValue: 1,
          duration,
          delay: 120,
          easing: Easing.elastic(1.3),
          useNativeDriver: true,
        });
        running.push(swingIn);
        swingIn.start(({ finished }) => {
          if (!finished || cancelled || !sway) return;
          const half = (to: number) =>
            Animated.timing(drift, {
              toValue: to,
              duration: 1700,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            });
          const loop = Animated.loop(
            Animated.sequence([Animated.delay(phase), half(1), half(-1), half(0)]),
          );
          running.push(loop);
          loop.start();
        });
      });
    return () => {
      cancelled = true;
      running.forEach((a) => a.stop());
    };
  }, [swing, drift, duration, phase, sway]);

  const degrees = Animated.add(
    swing.interpolate({ inputRange: [0, 1], outputRange: [from, rest] }),
    drift.interpolate({ inputRange: [-1, 1], outputRange: [-sway, sway] }),
  );
  return degrees.interpolate({
    inputRange: [-360, 360],
    outputRange: ["-360deg", "360deg"],
  });
}

const RAIL = 4;
const RING = 12;

const useStyles = makeStyles((theme) => ({
  stripe: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: theme.colors.surfaceAlt,
  },
  rail: {
    height: RAIL,
    borderRadius: RAIL / 2,
    backgroundColor: theme.colors.text,
  },
  cap: {
    position: "absolute",
    top: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.text,
  },
  capLeft: { left: -2 },
  capRight: { right: -2 },
  ring: {
    position: "absolute",
    top: -(RING - RAIL) / 2,
    width: RING,
    height: RING,
    marginLeft: -RING / 2,
    borderRadius: RING / 2,
    borderWidth: 2,
    borderColor: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
}));
