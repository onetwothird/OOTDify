// Tailor's chalk marks: a small cross at each of the four points the garment
// hangs from, each pair joined by a thin "measuring tape". Shows the user why
// the garment sits where it does. Coordinates are preview pixels.
//
// The tapes draw in once, from their midpoint, when the first pose arrives —
// the screen's single entrance moment. After that everything glides.
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { useReduceMotion } from "../../../shared/hooks/useReduceMotion";
import type { Anchors, Point } from "./overlayGeometry";
import { useGlide } from "./useGlide";

const CHALK = "#FFFFFF";
const TICK_LONG = 14;
const TICK_SHORT = 6;
const STROKE = 2;
const DRAW_IN_MS = 300;

function Tick({ point, reduce }: { point: Point; reduce: boolean }) {
  const left = useGlide(point.x, reduce);
  const top = useGlide(point.y, reduce);
  return (
    <Animated.View style={[styles.tickOrigin, { left, top }]}>
      <View style={styles.tickH} />
      <View style={styles.tickV} />
    </Animated.View>
  );
}

function Tape({ pair, reduce, drawn }: { pair: [Point, Point]; reduce: boolean; drawn: Animated.Value }) {
  const [a, b] = pair;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  // A line looks the same turned 180°, so keep the angle in [-90, 90]: left/right
  // keypoints are often ordered right-to-left, and ±180 jitter would spin the glide.
  const raw = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const angle = raw > 90 ? raw - 180 : raw < -90 ? raw + 180 : raw;
  const midX = useGlide((a.x + b.x) / 2, reduce);
  const midY = useGlide((a.y + b.y) / 2, reduce);
  const width = useGlide(length, reduce);
  const rotation = useGlide(angle, reduce);
  return (
    <Animated.View style={[styles.tickOrigin, { left: midX, top: midY }]}>
      <Animated.View
        style={[
          styles.tape,
          {
            width,
            marginLeft: Animated.multiply(width, -0.5),
            transform: [
              { rotate: rotation.interpolate({ inputRange: [-180, 180], outputRange: ["-180deg", "180deg"] }) },
              { scaleX: drawn },
            ],
          },
        ]}
      />
    </Animated.View>
  );
}

export function ChalkMarks({ anchors, faded }: { anchors: Anchors | null; faded: boolean }) {
  const reduce = useReduceMotion();
  const [drawn] = useState(() => new Animated.Value(0));
  // Keep the last anchors on screen while fading out (adjusting state during
  // render, React's pattern for values derived from previous props).
  const [shown, setShown] = useState<Anchors | null>(anchors);
  if (anchors && anchors !== shown) setShown(anchors);
  const firstAnchors = !!anchors;
  const opacity = useGlide(anchors ? (faded ? 0.35 : 0.9) : 0, reduce, 250);

  // Draw the tapes in once, the first time a pose is placed.
  useEffect(() => {
    if (!firstAnchors) return;
    if (reduce) {
      drawn.setValue(1);
      return;
    }
    Animated.timing(drawn, {
      toValue: 1,
      duration: DRAW_IN_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [firstAnchors, reduce, drawn]);

  if (!shown) return null;
  return (
    <Animated.View accessible={false} pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <Tape pair={shown.top} reduce={reduce} drawn={drawn} />
      <Tape pair={shown.bottom} reduce={reduce} drawn={drawn} />
      {[...shown.top, ...shown.bottom].map((p, i) => (
        <Tick key={i} point={p} reduce={reduce} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Zero-size view placed at a point; children are centred on it.
  tickOrigin: { position: "absolute", width: 0, height: 0, alignItems: "center", justifyContent: "center" },
  tickH: { position: "absolute", width: TICK_LONG, height: STROKE, backgroundColor: CHALK },
  tickV: { position: "absolute", width: STROKE, height: TICK_SHORT, backgroundColor: CHALK },
  tape: { position: "absolute", left: 0, height: 1, backgroundColor: CHALK, opacity: 0.6 },
});
