// C:\OOTDify\src\shared\components\PolarStage.tsx
// The scene behind Penggi on the sign-in and sign-up screens: a polar night
// in the app's own blues. A brand-blue sky fading to a pale horizon, white
// moonlight glowing low behind Penggi, two soft aurora ribbons drifting very
// slowly (the only ambient motion; still under Reduce Motion), a few stars,
// and the small ice floe he stands on. Every colour is a theme token or a
// blend of two (mixHex).
import { BlurMask, Canvas, Circle, Group, LinearGradient, Oval, Path, RadialGradient, Rect, vec } from "@shopify/react-native-skia";
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { useReduceMotion } from "../hooks/useReduceMotion";
import { mixHex } from "../lib/mixHex";
import { useAppTheme } from "../theme/ThemeProvider";

/** Stars as fractions of the stage: x, y and size in px. */
const STARS = [
  { x: 0.12, y: 0.22, r: 5 },
  { x: 0.24, y: 0.5, r: 3 },
  { x: 0.83, y: 0.18, r: 6 },
  { x: 0.9, y: 0.44, r: 3.5 },
  { x: 0.7, y: 0.32, r: 2.5 },
  { x: 0.36, y: 0.14, r: 2.5 },
];
const DRIFT_MS = 7000;

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
}: {
  width: number;
  height: number;
  /** Where Penggi's feet meet the floe (px from the top). */
  floorY: number;
  floeWidth: number;
}) {
  const { colors } = useAppTheme();
  const reduceMotion = useReduceMotion();
  const [drift] = useState(() => new Animated.Value(0));

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

  const skyTop = colors.brand;
  const skyMid = mixHex(colors.brand, colors.surface, 0.55);
  const horizon = mixHex(colors.primary, colors.surface, 0.5);
  const glow = colors.surface;
  const auroraLight = mixHex(colors.brand, colors.surface, 0.6);
  const auroraSoft = mixHex(colors.brand, colors.surface, 0.75);
  const floeEdge = mixHex(colors.onPrimarySubtle, colors.surface, 0.35);
  const glowR = Math.max(width, height) * 0.62;
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
        <Circle cx={width / 2} cy={floorY} r={glowR}>
          <RadialGradient c={vec(width / 2, floorY)} r={glowR} colors={[`${glow}E6`, `${glow}00`]} positions={[0, 1]} />
        </Circle>
        <Group color={colors.surface}>
          {STARS.map((s, i) => (
            <Path key={i} path={sparkle(s.x * width, s.y * height, s.r)} opacity={0.9} />
          ))}
        </Group>
      </Canvas>

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
        <Oval x={width / 2 - floeWidth / 2} y={floorY - floeH / 2 + 5} width={floeWidth} height={floeH} color={floeEdge} />
        <Oval x={width / 2 - floeWidth / 2} y={floorY - floeH / 2} width={floeWidth} height={floeH} color={colors.surface} />
      </Canvas>
    </View>
  );
}
