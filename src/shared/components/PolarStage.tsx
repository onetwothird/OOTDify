// C:\OOTDify\src\shared\components\PolarStage.tsx
// The scene behind Penggi on the sign-in and sign-up screens: a polar night
// in the app's own blues. A brand-blue sky fading to a pale horizon, white
// moonlight glowing low behind Penggi, two soft aurora ribbons drifting very
// slowly, a few stars that twinkle out of step (both still under Reduce Motion),
// and the small ice floe he stands on. Every colour is a theme token or a
// blend of two (mixHex).
import { BlurMask, Canvas, Circle, LinearGradient, Oval, Path, RadialGradient, Rect, vec } from "@shopify/react-native-skia";
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { useReduceMotion } from "../hooks/useReduceMotion";
import { mixHex } from "../lib/mixHex";
import { useAppTheme } from "../theme/ThemeProvider";

/** Stars as fractions of the stage: x, y and size in px. */
export type Star = { x: number; y: number; r: number };

const STARS: Star[] = [
  { x: 0.12, y: 0.22, r: 5 },
  { x: 0.24, y: 0.5, r: 3 },
  { x: 0.83, y: 0.18, r: 6 },
  { x: 0.9, y: 0.44, r: 3.5 },
  { x: 0.7, y: 0.32, r: 2.5 },
  { x: 0.36, y: 0.14, r: 2.5 },
];
const DRIFT_MS = 7000;
/** One full twinkle cycle; each star peaks at a different point in it. */
const TWINKLE_MS = 3200;
/** Brightness / size keyframes over a cycle; star i starts i steps along. */
const TWINKLE_OPACITY = [0.35, 1, 0.45, 0.8, 0.35];
const TWINKLE_SCALE = [0.7, 1.2, 0.8, 1, 0.7];
const TWINKLE_STEPS = [0, 0.25, 0.5, 0.75, 1];

/** keyframes rotated by `shift` steps, closed so the loop has no jump. */
function rotated(frames: number[], shift: number): number[] {
  const open = frames.slice(0, -1);
  const k = shift % open.length;
  const turned = [...open.slice(k), ...open.slice(0, k)];
  return [...turned, turned[0]];
}

/** A four-point sparkle centred on (x, y). */
function sparkle(x: number, y: number, r: number): string {
  const k = r * 0.28;
  return `M${x} ${y - r} Q${x + k} ${y - k} ${x + r} ${y} Q${x + k} ${y + k} ${x} ${y + r} Q${x - k} ${y + k} ${x - r} ${y} Q${x - k} ${y - k} ${x} ${y - r} Z`;
}

/** A wavy ribbon across `w`, centred around `y`, `th` thick. */
function ribbon(w: number, y: number, rise: number, th: number): string {
  return (
    `M0 ${y} C${w * 0.3} ${y - rise} ${w * 0.62} ${y + rise} ${w} ${y - rise * 0.6} ` +
    `L${w} ${y - rise * 0.6 + th} C${w * 0.62} ${y + rise + th * 0.6} ${w * 0.3} ${y - rise + th * 1.3} 0 ${y + th} Z`
  );
}

export function PolarStage({
  width,
  height,
  floorY,
  floeWidth,
  centerX = 0.5,
  sky,
  glowScale = 0.62,
  stars = STARS,
  glowAlpha = "E6",
}: {
  width: number;
  height: number;
  /** Where Penggi's feet meet the floe (px from the top). */
  floorY: number;
  floeWidth: number;
  /** Where Penggi stands across the stage, 0..1 (centre by default). */
  centerX?: number;
  /** Sky gradient top → middle → horizon; the brand sky by default. */
  sky?: [string, string, string];
  /** Moonlight radius as a share of the stage's longer side. */
  glowScale?: number;
  /** Where the stars go; keep them clear of any text drawn over the stage. */
  stars?: Star[];
  /** Moonlight strength at its centre, as a two-digit hex alpha ("E6" ≈ 90%). */
  glowAlpha?: string;
}) {
  const { colors } = useAppTheme();
  const reduceMotion = useReduceMotion();
  const [drift] = useState(() => new Animated.Value(0));
  const [twinkle] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(twinkle, { toValue: 1, duration: TWINKLE_MS, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [twinkle, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: DRIFT_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: DRIFT_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, reduceMotion]);

  if (width <= 0 || height <= 0) return null;

  const skyTop = sky?.[0] ?? colors.brand;
  const skyMid = sky?.[1] ?? mixHex(colors.brand, colors.surface, 0.55);
  const horizon = sky?.[2] ?? mixHex(colors.primary, colors.surface, 0.5);
  const glow = colors.surface;
  const auroraLight = mixHex(colors.brand, colors.surface, 0.6);
  const auroraSoft = mixHex(colors.brand, colors.surface, 0.75);
  const floeEdge = mixHex(colors.onPrimarySubtle, colors.surface, 0.35);
  const glowR = Math.max(width, height) * glowScale;
  const cx = width * centerX;
  const floeH = floeWidth * 0.2;
  // The aurora canvas is wider than the stage so drifting never shows an edge.
  const auroraW = width * 1.3;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={[skyTop, skyMid, horizon]} positions={[0, 0.55, 1]} />
        </Rect>
        {/* Moonlight low behind Penggi, fading out into the sky. */}
        <Circle cx={cx} cy={floorY} r={glowR}>
          <RadialGradient c={vec(cx, floorY)} r={glowR} colors={[`${glow}${glowAlpha}`, `${glow}00`]} positions={[0, 1]} />
        </Circle>
      </Canvas>

      {/* Stars, each in its own small layer so it can twinkle. */}
      {stars.map((s, i) => {
        const box = s.r * 3;
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: s.x * width - box / 2,
              top: s.y * height - box / 2,
              width: box,
              height: box,
              opacity: reduceMotion
                ? 0.9
                : twinkle.interpolate({ inputRange: TWINKLE_STEPS, outputRange: rotated(TWINKLE_OPACITY, i) }),
              transform: reduceMotion
                ? []
                : [{ scale: twinkle.interpolate({ inputRange: TWINKLE_STEPS, outputRange: rotated(TWINKLE_SCALE, i) }) }],
            }}
          >
            <Canvas style={StyleSheet.absoluteFill}>
              <Circle cx={box / 2} cy={box / 2} r={s.r * 1.3} color={colors.surface} opacity={0.25}>
                <BlurMask blur={s.r * 0.8} style="normal" />
              </Circle>
              <Path path={sparkle(box / 2, box / 2, s.r)} color={colors.surface} />
            </Canvas>
          </Animated.View>
        );
      })}

      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: -width * 0.15,
          width: auroraW,
          height,
          transform: reduceMotion
            ? []
            : [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.07, width * 0.07] }) }],
        }}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          <Path path={ribbon(auroraW, height * 0.2, height * 0.08, height * 0.11)} color={auroraLight} opacity={0.45}>
            <BlurMask blur={16} style="normal" />
          </Path>
          <Path path={ribbon(auroraW, height * 0.33, -height * 0.06, height * 0.08)} color={auroraSoft} opacity={0.35}>
            <BlurMask blur={20} style="normal" />
          </Path>
        </Canvas>
      </Animated.View>

      {/* The ice floe: a thick edge under a white top. */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Oval x={cx - floeWidth / 2} y={floorY - floeH / 2 + 5} width={floeWidth} height={floeH} color={floeEdge} />
        <Oval x={cx - floeWidth / 2} y={floorY - floeH / 2} width={floeWidth} height={floeH} color={colors.surface} />
      </Canvas>
    </View>
  );
}
