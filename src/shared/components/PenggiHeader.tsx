// C:\OOTDify\src\shared\components\PenggiHeader.tsx
// Header for a top-level tab, set in Penggi's polar night: the whole header
// is the scene (PolarStage, the same world as sign-in and sign-up). In light
// mode it is a pale periwinkle sky with deep-denim text; in dark mode a
// deep-denim night with white text (useHeaderSky). It runs edge to
// edge and up to the status bar (PenggiStatusShade fills the bar itself), a
// square-cornered band with no rounding. A top row holds an optional back link and
// the corner slot (the bell + gear). The title, count, subtitle and the tab's
// action sit on the left; Penggi, in this tab's outfit, stands on his ice floe
// on the right, in a small pool of moonlight.
//
// Tap Penggi and he hops with a burst of sparkles; his tip takes the
// subtitle's place for a few seconds (tap again for the next), so the header
// never changes size. Reduce Motion keeps him still; the tip still shows.
import { Ionicons } from "@expo/vector-icons";
import { Image, type ImageSource } from "expo-image";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReduceMotion } from "../hooks/useReduceMotion";
import { mixHex } from "../lib/mixHex";
import { makeStyles } from "../theme/makeStyles";
import type { Theme } from "../config/theme";
import { useAppTheme, useThemeState } from "../theme/ThemeProvider";
import { PolarStage, type Star } from "./PolarStage";

/** How long a tip stays up after a tap. */
const TIP_MS = 4200;
/** Penggi's feet sit this far up from the bottom of his (square) art. */
const FEET = 0.08;
/** The floe's top edge, up from the header's bottom. */
const FLOOR_INSET = 16;
/** Sparkles thrown when he hops: angle (deg) and distance from his middle. */
/**
 * Stars only on Penggi's side, below the bell + gear and right of the text
 * column, so none ever sits on a letter.
 */
const HEADER_STARS: Star[] = [
  { x: 0.74, y: 0.34, r: 3.5 },
  { x: 0.97, y: 0.46, r: 3 },
  { x: 0.71, y: 0.82, r: 2.5 },
  { x: 0.95, y: 0.9, r: 2 },
];
/** Height of the top row (back link, bell + gear). */
const TOP_ROW = 46;
const SPARKS = Array.from({ length: 7 }, (_, i) => ({ angle: -165 + i * 25, distance: 40 + (i % 2) * 14 }));

export interface HeaderSky {
  /** Sky gradient top → middle → bottom. */
  sky: [string, string, string];
  ink: string;
  inkMuted: string;
  /** Fill for small pills (the count) on the sky. */
  chip: string;
  /** Whether the sky is dark (white text, light status bar icons). */
  dark: boolean;
}

export function headerSky(theme: Theme, scheme: "light" | "dark"): HeaderSky {
  const c = theme.colors;
  if (scheme === "dark") {
    return {
      sky: [c.feature, mixHex(c.feature, c.brand, 0.3), mixHex(c.feature, c.brand, 0.55)],
      ink: c.onFeature,
      inkMuted: c.onFeatureMuted,
      chip: mixHex(c.feature, c.onFeature, 0.18),
      dark: true,
    };
  }
  // A light, airy sky: the brand blue washed toward white, palest at the floe.
  const top = mixHex(c.brand, c.surface, 0.62);
  return {
    sky: [top, mixHex(c.brand, c.surface, 0.76), mixHex(c.primary, c.surface, 0.35)],
    ink: c.feature,
    inkMuted: mixHex(c.feature, c.brand, 0.45),
    chip: mixHex(top, c.surface, 0.55),
    dark: false,
  };
}

/** The header's sky for the current theme. */
export function useHeaderSky(): HeaderSky {
  const theme = useAppTheme();
  const { scheme } = useThemeState();
  return headerSky(theme, scheme);
}

export function PenggiHeader({
  title,
  subtitle,
  meta,
  image,
  tips,
  penggiLabel,
  right,
  corner,
  inset,
  gutter: gutterProp,
  onBack,
  backLabel,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  /** Penggi in this tab's outfit (assets/images/headers/*). */
  image: ImageSource | number;
  /** Lines Penggi says when tapped, in order. */
  tips: string[];
  /** Accessibility label for tapping Penggi. */
  penggiLabel: string;
  /** An action under the text, e.g. the Add button. Use a light (secondary) button. */
  right?: ReactNode;
  /** Top-right of the header: the bell + gear (QuickActions tone "header"). */
  corner?: ReactNode;
  /** The screen's side padding the header bleeds through; the page gutter by default. */
  inset?: number;
  /** Left/right padding of the text and top row; follows `inset` by default. */
  gutter?: number;
  /** Shows a back link in the top row. */
  onBack?: () => void;
  backLabel?: string;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const reduceMotion = useReduceMotion();
  const { width } = useWindowDimensions();
  const size = width < 380 ? 118 : width < 430 ? 132 : 148;
  const bleed = inset ?? theme.spacing.page;
  // Text keeps to the page's rail even though the sky runs to the edge.
  const gutter = gutterProp ?? Math.max(bleed, 16);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const feetY = box.h - FLOOR_INSET;
  // Penggi stands near the right edge; the floe and moonlight follow him.
  const standAt = box.w ? Math.min(0.82, 1 - (size * 0.5 + gutter - 6) / box.w) : 0.8;

  const pal = useHeaderSky();

  const [enter] = useState(() => new Animated.Value(0));
  const [bob] = useState(() => new Animated.Value(0));
  const [hopY] = useState(() => new Animated.Value(0));
  const [tilt] = useState(() => new Animated.Value(0));
  const [spark] = useState(() => new Animated.Value(0));
  const [tipFade] = useState(() => new Animated.Value(0));
  const [tipIndex, setTipIndex] = useState(-1);
  const [taps, setTaps] = useState(0);

  // Entrance pop, then a slow bob.
  useEffect(() => {
    if (reduceMotion) return;
    const intro = Animated.spring(enter, { toValue: 1, friction: 6, tension: 60, delay: 60, useNativeDriver: true });
    const idle = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    intro.start();
    idle.start();
    return () => {
      intro.stop();
      idle.stop();
    };
  }, [enter, bob, reduceMotion]);

  // Each tap: the tip replaces the subtitle, then the subtitle comes back.
  useEffect(() => {
    if (!taps) return;
    tipFade.setValue(reduceMotion ? 1 : 0);
    const show = Animated.timing(tipFade, { toValue: 1, duration: reduceMotion ? 0 : 180, useNativeDriver: true });
    show.start();
    const id = setTimeout(() => setTipIndex(-1), TIP_MS);
    return () => {
      show.stop();
      clearTimeout(id);
    };
  }, [taps, tipFade, reduceMotion]);

  const hop = useCallback(() => {
    if (reduceMotion) return;
    hopY.setValue(0);
    tilt.setValue(0);
    spark.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(hopY, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(hopY, { toValue: 0, friction: 4, tension: 140, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(tilt, { toValue: -1, duration: 100, useNativeDriver: true }),
        Animated.timing(tilt, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.spring(tilt, { toValue: 0, friction: 4, tension: 120, useNativeDriver: true }),
      ]),
      Animated.timing(spark, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [hopY, tilt, spark, reduceMotion]);

  const tap = () => {
    hop();
    if (tips.length) setTipIndex((i) => (i + 1) % tips.length);
    setTaps((n) => n + 1);
  };

  const motion = reduceMotion
    ? []
    : [
        { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
        { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
        { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
        { translateY: hopY.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
        { rotate: tilt.interpolate({ inputRange: [-1, 1], outputRange: ["-8deg", "8deg"] }) },
      ];
  const sparkColors = [pal.dark ? theme.colors.onFeature : theme.colors.brand, theme.colors.accentBright, theme.colors.success];
  const tip = tipIndex >= 0 ? tips[tipIndex] : null;
  const penggiLeft = box.w * standAt - size / 2;
  const penggiTop = feetY - size * (1 - FEET);

  return (
    <View
      style={[
        styles.card,
        { marginHorizontal: -bleed, minHeight: TOP_ROW + size * (1 - FEET) + FLOOR_INSET + 8 },
      ]}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <PolarStage
        width={box.w}
        height={box.h}
        floorY={feetY}
        floeWidth={size * 0.78}
        centerX={standAt}
        sky={pal.sky}
        glowScale={0.26}
        glowAlpha={pal.dark ? "55" : "80"}
        stars={HEADER_STARS}
      />

      <View style={[styles.topRow, { paddingLeft: gutter - 4, paddingRight: gutter }]}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            onPress={onBack}
            hitSlop={8}
            style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-back" size={18} color={pal.ink} />
            {backLabel ? <Text style={[styles.backText, { color: pal.ink }]}>{backLabel}</Text> : null}
          </Pressable>
        ) : null}
        <View style={styles.topSpacer} />
        {corner}
      </View>

      {/* The words, clear of Penggi's spot on the right. */}
      <View style={[styles.text, { paddingLeft: gutter, marginRight: size * 0.9 + gutter - 14 }]}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.title, { color: pal.ink }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {meta ? (
            <View style={[styles.count, { backgroundColor: pal.chip }]}>
              <Text style={[styles.countText, { color: pal.ink }]} numberOfLines={1}>
                {meta}
              </Text>
            </View>
          ) : null}
        </View>

        {tip ? (
          <Animated.View style={[styles.tipRow, { opacity: tipFade }]} accessibilityLiveRegion="polite">
            <Ionicons name="bulb" size={14} color={pal.dark ? theme.colors.accentBright : theme.colors.accent} style={styles.tipIcon} />
            <Text style={[styles.tipText, { color: pal.ink }]} numberOfLines={4}>
              {tip}
            </Text>
          </Animated.View>
        ) : subtitle ? (
          <Text style={[styles.subtitle, { color: pal.inkMuted }]} numberOfLines={3}>
            {subtitle}
          </Text>
        ) : null}

        {right ? <View style={styles.right}>{right}</View> : null}
      </View>

      {box.w > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={penggiLabel}
          onPress={tap}
          style={[styles.penggi, { left: penggiLeft, top: penggiTop, width: size, height: size }]}
        >
          {!reduceMotion
            ? SPARKS.map((s, i) => {
                const rad = (s.angle * Math.PI) / 180;
                return (
                  <Animated.View
                    key={i}
                    pointerEvents="none"
                    style={[
                      styles.spark,
                      i % 2 ? styles.sparkRound : null,
                      {
                        backgroundColor: sparkColors[i % sparkColors.length],
                        top: size * 0.3,
                        left: size / 2,
                        opacity: spark.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] }),
                        transform: [
                          { translateX: spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(rad) * s.distance] }) },
                          { translateY: spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(rad) * s.distance] }) },
                          { scale: spark.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.1, 0.6] }) },
                          { rotate: "45deg" },
                        ],
                      },
                    ]}
                  />
                );
              })
            : null}
          <Animated.View
            style={{
              width: size,
              height: size,
              opacity: reduceMotion ? 1 : enter,
              transformOrigin: "50% 92%",
              transform: motion,
            }}
          >
            <Image source={image} style={{ width: size, height: size }} contentFit="contain" />
          </Animated.View>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Paints the status bar in the header's sky and matches its icons to it
 * while this screen is in front. Render it last in the screen's root view,
 * which pads its top by the status bar inset, so content scrolls under it.
 */
export function PenggiStatusShade() {
  const pal = useHeaderSky();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  return (
    <>
      {focused ? <StatusBar style={pal.dark ? "light" : "dark"} /> : null}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { bottom: undefined, height: insets.top, backgroundColor: pal.sky[0] }]}
      />
    </>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    marginBottom: theme.spacing.md,
    overflow: "hidden",
  },
  topRow: { height: TOP_ROW, flexDirection: "row", alignItems: "center" },
  topSpacer: { flex: 1 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 6 },
  backText: { fontSize: 14, fontWeight: "700", color: theme.colors.onFeature },
  text: { paddingTop: 2, paddingBottom: 24 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: {
    flexShrink: 1,
    color: theme.colors.onFeature,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  count: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999 },
  countText: { fontSize: 12, fontWeight: "700", color: theme.colors.onFeature },
  subtitle: { marginTop: 4, fontSize: 13.5, lineHeight: 19, color: theme.colors.onFeatureMuted },
  tipRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  tipIcon: { marginTop: 2 },
  tipText: { flex: 1, fontSize: 13.5, lineHeight: 19, fontWeight: "600", color: theme.colors.onFeature },
  right: { marginTop: 14, alignItems: "flex-start" },
  penggi: { position: "absolute" },
  spark: { position: "absolute", width: 8, height: 8, borderRadius: 2 },
  sparkRound: { width: 6, height: 6, borderRadius: 3 },
}));
