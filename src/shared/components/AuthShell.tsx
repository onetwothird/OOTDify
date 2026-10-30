// C:\OOTDify\src\shared\components\AuthShell.tsx
// Presentational shell for the sign-in, sign-up and password-reset screens.
// Deliberately unlike the landing page (pinstripes and a clothes rail): here
// Penggi stands on an ice floe in a polar dawn (PolarStage), and a white sheet
// with a rounded lip slides up over it carrying the title and the form.
//
// Penggi is the interactive part: he pops in, bobs while you fill the form,
// and hops (with a few sparkles) when tapped or when the screen nudges him —
// a new sign-up step, a field getting focus. Reduce Motion keeps him still.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReduceMotion } from "../hooks/useReduceMotion";
import { useT } from "../i18n/useT";
import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";
import { PolarStage } from "./PolarStage";

const ART = {
  signin: require("../../../assets/images/signin-penggi.png"),
  signup: require("../../../assets/images/signup-penggi.png"),
  default: require("../../../assets/images/mascot-penggi.png"),
};

export type AuthMascot = keyof typeof ART;

/** Sparkles thrown when Penggi hops: angle (deg) and distance from his head. */
const SPARKS = Array.from({ length: 7 }, (_, i) => ({ angle: -160 + i * (140 / 6), distance: 64 + (i % 2) * 18 }));
/** How far the white sheet's lip overlaps the stage. */
const LIP = 28;
/** Space between the bottom of Penggi's box and the sheet's lip. */
const STAGE_BOTTOM = LIP + 10;
/** Penggi's feet sit this far up from the bottom of his (square) art. */
const FEET = 0.1;

interface HeroProps {
  title: string;
  subtitle: string;
  /** Omit on screens with nothing to go back to. */
  onBack?: () => void;
  mascot?: AuthMascot;
  /** Change it to make Penggi hop (e.g. the sign-up step, a focus counter). */
  nudge?: number | string;
}

export function AuthHero({ title, subtitle, onBack, mascot = "default", nudge }: HeroProps) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const size = Math.round(Math.min(Math.max(width * 0.42, 140), 190));

  const [enter] = useState(() => new Animated.Value(0));
  const [bob] = useState(() => new Animated.Value(0));
  const [hopY] = useState(() => new Animated.Value(0));
  const [tilt] = useState(() => new Animated.Value(0));
  const [spark] = useState(() => new Animated.Value(0));
  const [rise] = useState(() => new Animated.Value(0));
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const feetFromBottom = STAGE_BOTTOM + size * FEET;

  // Entrance: Penggi pops up into the spotlight, the sheet's words rise after.
  useEffect(() => {
    if (reduceMotion) return;
    const intro = Animated.parallel([
      Animated.spring(enter, { toValue: 1, friction: 6, tension: 60, delay: 80, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 1, duration: 420, delay: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
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
  }, [enter, rise, bob, reduceMotion]);

  const hop = useCallback(
    (withSparks: boolean) => {
      if (reduceMotion) return;
      hopY.setValue(0);
      tilt.setValue(0);
      spark.setValue(0);
      Animated.parallel([
        Animated.sequence([
          Animated.timing(hopY, { toValue: 1, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.spring(hopY, { toValue: 0, friction: 4, tension: 140, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(tilt, { toValue: -1, duration: 110, useNativeDriver: true }),
          Animated.timing(tilt, { toValue: 1, duration: 160, useNativeDriver: true }),
          Animated.spring(tilt, { toValue: 0, friction: 4, tension: 120, useNativeDriver: true }),
        ]),
        withSparks
          ? Animated.timing(spark, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true })
          : Animated.delay(0),
      ]).start();
    },
    [hopY, tilt, spark, reduceMotion],
  );

  // A nudge from the screen: hop, but not on the first render.
  const firstNudge = useRef(true);
  useEffect(() => {
    if (firstNudge.current) {
      firstNudge.current = false;
      return;
    }
    hop(false);
  }, [nudge, hop]);

  const penggiMotion = reduceMotion
    ? []
    : [
        { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [50, 0] }) },
        { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) },
        { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
        { translateY: hopY.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) },
        { rotate: tilt.interpolate({ inputRange: [-1, 1], outputRange: ["-9deg", "9deg"] }) },
      ];
  // The floor shadow shrinks as Penggi leaves the ground.
  const shadowScale = Animated.multiply(
    bob.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] }),
    hopY.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }),
  );
  const sparkColors = [theme.colors.brand, theme.colors.accentBright, theme.colors.success];

  return (
    <View>
      <View
        style={[styles.stage, { paddingTop: insets.top + 8, paddingBottom: STAGE_BOTTOM }]}
        onLayout={(e) => setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        <PolarStage width={stage.w} height={stage.h} floorY={stage.h - feetFromBottom + 2} floeWidth={size * 0.85} />
        <View style={styles.topRow}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("auth.common.back")}
              onPress={onBack}
              hitSlop={8}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            >
              <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
            </Pressable>
          ) : null}
        </View>

        <Animated.View
          style={[
            styles.floor,
            { width: size * 0.5, bottom: feetFromBottom - 5, opacity: reduceMotion ? 1 : enter, transform: reduceMotion ? [] : [{ scaleX: shadowScale }] },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("home.hero.mascot.a11y")}
          onPress={() => hop(true)}
          style={[styles.penggiHit, { width: size, height: size }]}
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
          <Animated.View style={{ width: size, height: size, transformOrigin: "50% 92%", transform: penggiMotion }}>
            <Image source={ART[mascot]} style={{ width: size, height: size }} contentFit="contain" />
          </Animated.View>
        </Pressable>
      </View>

      <Animated.View
        style={[
          styles.lip,
          {
            opacity: reduceMotion ? 1 : rise,
            transform: reduceMotion ? [] : [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
          },
        ]}
      >
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </Animated.View>
    </View>
  );
}

/** The form, laid straight on the white sheet; it rises in just after the title. */
export function AuthCard({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const reduceMotion = useReduceMotion();
  const [rise] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) return;
    const anim = Animated.timing(rise, {
      toValue: 1,
      duration: 460,
      delay: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [rise, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.form,
        reduceMotion
          ? null
          : { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const useStyles = makeStyles((theme) => ({
  stage: {
    alignItems: "center",
    backgroundColor: theme.colors.primary,
    overflow: "hidden",
  },
  topRow: { alignSelf: "stretch", height: 40, paddingHorizontal: theme.spacing.md, flexDirection: "row" },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  pressed: { opacity: 0.7 },
  floor: {
    position: "absolute",
    height: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.onPrimarySubtle,
  },
  penggiHit: { alignItems: "center", marginTop: -4 },
  spark: { position: "absolute", width: 9, height: 9, borderRadius: 2 },
  sparkRound: { width: 7, height: 7, borderRadius: 4 },
  lip: {
    marginTop: -LIP,
    paddingTop: 26,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    borderTopLeftRadius: LIP,
    borderTopRightRadius: LIP,
    backgroundColor: theme.colors.surface,
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    letterSpacing: -0.9,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
    maxWidth: 340,
  },
  form: { paddingHorizontal: theme.spacing.lg },
}));

