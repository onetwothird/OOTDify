// C:\OOTDify\src\app\(auth)\index.tsx
// Get Started / landing screen. The one visual idea is a clothes rail: a rod
// across a pinstriped page with three hang-tags on strings, each naming a
// feature that actually exists. The tags swing in, then sway gently (all of it
// skipped under Reduce Motion). Everything else stays quiet and left aligned.
// Always drawn light — see (auth)/_layout.tsx.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../../shared/components/AppButton";
import { Pinstripes, Rail, useSwing } from "../../shared/components/ClothesRail";
import { PRIVACY_ROUTE, TERMS_ROUTE } from "../../shared/config/legal";
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

  return (
    <View style={styles.screen}>
      <Pinstripes />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + theme.spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Text style={styles.wordmark}>Penggi</Text>

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
  wordmark: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: theme.colors.text,
  },
  display: {
    marginTop: 44,
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
