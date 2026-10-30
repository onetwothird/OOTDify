// C:\OOTDify\src\shared\components\BoutiqueBackdrop.tsx
// The landing page as a boutique window: a scalloped shop awning in brand
// stripes across the top (starting below the status bar, so the clock stays
// readable), a pale shirting-stripe wall, and a pool of light where the
// clothes rail hangs. Static on purpose — Penggi and the hang-tags move.
// Theme tokens only, blended with mixHex.
import { BlurMask, Canvas, Circle, Group, LinearGradient, Path, RadialGradient, Rect, vec } from "@shopify/react-native-skia";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mixHex } from "../lib/mixHex";
import { useAppTheme } from "../theme/ThemeProvider";

/** Height of the awning's flat part, below the status bar. */
export const AWNING = 30;
const STRIPE_TARGET = 34;
const PINSTRIPE_GAP = 22;
const ROD = 4;

/** Where the awning's scallops end, for laying content out below it. */
export function awningBottom(width: number, topInset: number): number {
  return topInset + AWNING + stripeWidth(width) / 2;
}

function stripeWidth(width: number): number {
  return width / Math.max(1, Math.round(width / STRIPE_TARGET));
}

/** One awning stripe with its rounded scallop, `x` from the left. */
function scallop(x: number, top: number, w: number): string {
  const bottom = top + AWNING;
  const r = w / 2;
  return `M${x} ${top} L${x + w} ${top} L${x + w} ${bottom} A${r} ${r} 0 0 1 ${x} ${bottom} Z`;
}

export function BoutiqueBackdrop({ glowAt = 0.58 }: { /** The light pool's centre, as a fraction of height. */ glowAt?: number }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const { w, h } = size;

  const wallTop = mixHex(colors.primary, colors.surface, 0.25);
  const wallBottom = colors.background;
  const pin = mixHex(colors.brand, wallTop, 0.9);
  const light = mixHex(colors.brand, colors.surface, 0.78);
  const sw = w > 0 ? stripeWidth(w) : STRIPE_TARGET;
  const top = insets.top;
  const stripes = w > 0 ? Math.round(w / sw) : 0;
  const glowR = w * 0.75;

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {w > 0 && h > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Rect x={0} y={0} width={w} height={h}>
            <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={[wallTop, wallBottom]} />
          </Rect>
          <Group color={pin}>
            {Array.from({ length: Math.ceil(w / PINSTRIPE_GAP) }, (_, i) => (
              <Rect key={i} x={i * PINSTRIPE_GAP + PINSTRIPE_GAP / 2} y={top} width={1} height={h - top} />
            ))}
          </Group>
          {/* The light over the rail. */}
          <Circle cx={w / 2} cy={h * glowAt} r={glowR}>
            <RadialGradient
              c={vec(w / 2, h * glowAt)}
              r={glowR}
              colors={[`${colors.surface}F2`, `${colors.surface}00`]}
            />
          </Circle>

          {/* Awning: its shadow on the wall, the stripes, then the rod. */}
          <Group color={colors.brand} opacity={0.22} transform={[{ translateY: 6 }]}>
            {Array.from({ length: stripes }, (_, i) => (
              <Path key={i} path={scallop(i * sw, top, sw)} />
            ))}
            <BlurMask blur={6} style="normal" />
          </Group>
          {Array.from({ length: stripes }, (_, i) => (
            <Path key={i} path={scallop(i * sw, top, sw)} color={i % 2 ? light : colors.brand} />
          ))}
          <Rect x={0} y={top} width={w} height={ROD} color={colors.onPrimary} />
        </Canvas>
      ) : null}
    </View>
  );
}
