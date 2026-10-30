// C:\OOTDify\src\app\(auth)\index.tsx
// Get Started / landing screen, set as a boutique window (BoutiqueBackdrop:
// a striped shop awning, a pinstriped wall, light over the rail). The one
// visual idea is a clothes rail: a rod with three hang-tags on strings, each naming a
// feature that actually exists. The tags swing in, then sway gently (all of it
// skipped under Reduce Motion). Penggi's round face stands in for the
// wordmark: it drops in, tilts now and then, and spins when tapped.
// Everything else stays quiet and left aligned. Sign-in and sign-up use a
// different shell on purpose (see AuthShell.tsx).
// Always drawn light — see (auth)/_layout.tsx.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../../shared/components/AppButton";
import { awningBottom, BoutiqueBackdrop } from "../../shared/components/BoutiqueBackdrop";
import { Rail, useSwing } from "../../shared/components/ClothesRail";
import { PRIVACY_ROUTE, TERMS_ROUTE } from "../../shared/config/legal";
import { useReduceMotion } from "../../shared/hooks/useReduceMotion";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { makeStyles } from "../../shared/theme/makeStyles";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import type { TranslationKey } from "../../shared/i18n/translate";

// Each tag hangs on its own string length and comes to rest at a slight,
// different tilt, like tags on a real rail.
const TAGS: {
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  string: number;
  rest: number;
}[] = [
  {
    icon: "shirt-outline",
    titleKey: "auth.landing.feature.wardrobe.title",
    bodyKey: "auth.landing.feature.wardrobe.body",
    string: 18,
    rest: -3,
  },
  {
    icon: "camera-outline",
    titleKey: "auth.landing.feature.tryon.title",
    bodyKey: "auth.landing.feature.tryon.body",
    string: 40,
    rest: 2,
  },
  {
    icon: "calendar-outline",
    titleKey: "auth.landing.feature.plan.title",
    bodyKey: "auth.landing.feature.plan.body",
    string: 26,
    rest: -1.5,
  },
];

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const styles = useStyles();
  const { t } = useT();
  const { width } = useWindowDimensions();

  return (
    <View style={styles.screen}>
      <BoutiqueBackdrop />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: awningBottom(width, insets.top) + 14, paddingBottom: insets.bottom + theme.spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <PenggiFace />

        <Text style={styles.display} accessibilityRole="header">
          {t("auth.landing.display")}
        </Text>
        <Text style={styles.lede}>{t("auth.landing.lede")}</Text>

        {/* The rail */}
        <View style={styles.railWrap}>
          <Rail rings={RING_AT} />
          <View style={styles.tagRow}>
            {TAGS.map((tag, index) => (
              <HangTag key={tag.titleKey} tag={tag} index={index} />
            ))}
          </View>
        </View>

        <View style={styles.actions}>
          <AppButton
            label={t("auth.landing.create_account")}
            onPress={() => router.push("/signup")}
            style={styles.pill}
          />
          <AppButton
            label={t("auth.landing.login")}
            variant="secondary"
            onPress={() => router.push("/login")}
            style={styles.pill}
          />
          <Text style={styles.legal}>
            {t("auth.landing.legal.prefix")}
            <Text
              accessibilityRole="link"
              suppressHighlighting={false}
              style={styles.legalLink}
              onPress={() => router.push(TERMS_ROUTE)}
            >
              {t("auth.landing.legal.terms")}
            </Text>
            {t("auth.landing.legal.and")}
            <Text
              accessibilityRole="link"
              suppressHighlighting={false}
              style={styles.legalLink}
              onPress={() => router.push(PRIVACY_ROUTE)}
            >
              {t("auth.landing.legal.privacy")}
            </Text>
            {t("auth.landing.legal.suffix")}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const FACE = 64;
/** Pause between Penggi's idle head tilts. */
const TILT_EVERY_MS = 3600;

/**
 * Penggi's face in place of the wordmark. Drops in with a little spin, tilts
 * his head every few seconds, and on a tap does a full spin with a pop.
 */
function PenggiFace() {
  const styles = useStyles();
  const { t } = useT();
  const reduceMotion = useReduceMotion();
  const [drop] = useState(() => new Animated.Value(0));
  const [tilt] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) return;
    const intro = Animated.spring(drop, { toValue: 1, friction: 5, tension: 70, delay: 120, useNativeDriver: true });
    const idle = Animated.loop(
      Animated.sequence([
        Animated.delay(TILT_EVERY_MS),
        Animated.timing(tilt, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(tilt, { toValue: -0.6, duration: 300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.spring(tilt, { toValue: 0, friction: 4, tension: 90, useNativeDriver: true }),
      ]),
    );
    intro.start();
    idle.start();
    return () => {
      intro.stop();
      idle.stop();
    };
  }, [drop, tilt, reduceMotion]);

  const tap = () => {
    if (reduceMotion) return;
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 720, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
  };

  const transform = reduceMotion
    ? []
    : [
        { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) },
        { rotate: drop.interpolate({ inputRange: [0, 1], outputRange: ["-25deg", "0deg"] }) },
        { rotate: tilt.interpolate({ inputRange: [-1, 1], outputRange: ["-10deg", "10deg"] }) },
        { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
        { scale: spin.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 1.22, 1] }) },
      ];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("home.hero.mascot.a11y")}
      onPress={tap}
      hitSlop={8}
      style={styles.face}
    >
      <Animated.View style={{ width: FACE, height: FACE, opacity: reduceMotion ? 1 : drop, transform }}>
        <Image source={require("../../../assets/images/front-penggi.png")} style={styles.faceImage} contentFit="contain" />
      </Animated.View>
    </Pressable>
  );
}

// Where each tag's string loops over the rail (centres of the three columns).
const RING_AT = [0.17, 0.5, 0.83];

/** One hang-tag: swings in once, then sways gently out of phase with the others. */
function HangTag({ tag, index }: { tag: (typeof TAGS)[number]; index: number }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const rotate = useSwing({
    // Start swung out the opposite way to where it comes to rest.
    from: tag.rest + (index % 2 === 0 ? 16 : -16),
    rest: tag.rest,
    sway: 1.6,
    phase: index * 450,
  });
  return (
    <Animated.View style={[styles.hanger, { transform: [{ rotate }] }]}>
      <View style={[styles.string, { height: tag.string }]} />
      <View style={styles.tag}>
        <View style={styles.hole} />
        <Ionicons name={tag.icon} size={18} color={theme.colors.text} />
        <Text style={styles.tagTitle}>{t(tag.titleKey)}</Text>
        <Text style={styles.tagBody}>{t(tag.bodyKey)}</Text>
      </View>
    </Animated.View>
  );
}

const HOLE = 10;

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  face: { alignSelf: "flex-start", marginLeft: -6 },
  faceImage: { width: FACE, height: FACE },
  display: {
    marginTop: 28,
    fontSize: 46,
    lineHeight: 48,
    fontWeight: "700",
    letterSpacing: -2,
    color: theme.colors.text,
  },
  lede: {
    marginTop: 14,
    fontSize: 15.5,
    lineHeight: 23,
    color: theme.colors.textMuted,
    maxWidth: 330,
  },

  // Rail + tags
  railWrap: { marginTop: 40, marginHorizontal: -theme.spacing.sm },
  tagRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: theme.spacing.sm,
  },
  hanger: { flex: 1, minWidth: 0, alignItems: "center", transformOrigin: "top" },
  string: { width: StyleSheet.hairlineWidth * 2, backgroundColor: theme.colors.textMuted },
  tag: {
    alignSelf: "stretch",
    paddingTop: HOLE + 14,
    paddingHorizontal: 12,
    paddingBottom: 14,
    gap: 6,
    borderRadius: 12,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  // The punched hole the string passes through.
  hole: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    width: HOLE,
    height: HOLE,
    borderRadius: HOLE / 2,
    backgroundColor: theme.colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  tagTitle: { fontSize: 13.5, lineHeight: 17, fontWeight: "700", color: theme.colors.text },
  tagBody: { fontSize: 11.5, lineHeight: 16, color: theme.colors.textMuted },

  actions: { marginTop: "auto", paddingTop: 40, gap: 12 },
  pill: { borderRadius: theme.borderRadius.pill },
  legal: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    color: theme.colors.textMuted,
    paddingHorizontal: theme.spacing.sm,
  },
  legalLink: { color: theme.colors.text, fontWeight: "700" },
}));
