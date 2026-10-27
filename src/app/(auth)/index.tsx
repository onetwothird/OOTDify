// C:\OOTDify\src\app\(auth)\index.tsx
// Get Started / landing screen: brand lockup, honest feature highlights and the
// two entry points. No placeholder imagery and no fake carousel — every line
// below describes a feature that actually exists. The brand mark is drawn with
// an icon + wordmark (no bitmap).
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../../shared/components/AppButton";
import { PRIVACY_ROUTE, TERMS_ROUTE } from "../../shared/config/legal";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { makeStyles } from "../../shared/theme/makeStyles";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import type { TranslationKey } from "../../shared/i18n/translate";

const FEATURE_KEYS: {
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}[] = [
  {
    icon: "shirt-outline",
    titleKey: "auth.landing.feature.wardrobe.title",
    bodyKey: "auth.landing.feature.wardrobe.body",
  },
  {
    icon: "body-outline",
    titleKey: "auth.landing.feature.body_scan.title",
    bodyKey: "auth.landing.feature.body_scan.body",
  },
  {
    icon: "calendar-outline",
    titleKey: "auth.landing.feature.plan.title",
    bodyKey: "auth.landing.feature.plan.body",
  },
];

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const styles = useStyles();
  const { t } = useT();

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.lg }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.hero, { paddingTop: insets.top + 14 }]}>
          <View style={styles.brandRow}>
            <Image
              source={require("../../../assets/images/ootdify-icon.png")}
              style={styles.brandIcon}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <Text style={styles.brandName}>OOTDify</Text>
          </View>

          <Text style={styles.kicker}>{t("auth.landing.kicker")}</Text>
          <Text style={styles.display}>
            {t("auth.landing.display")}
          </Text>
          <Text style={styles.lede}>
            {t("auth.landing.lede")}
          </Text>
        </View>

        <View style={styles.body}>
          <View style={styles.featureCard}>
            {FEATURE_KEYS.map((feature, index) => (
              <View
                key={feature.titleKey}
                style={[styles.featureRow, index > 0 && styles.featureDivider]}
              >
                <View style={styles.featureIcon}>
                  <Ionicons name={feature.icon} size={20} color={theme.colors.text} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>{t(feature.titleKey)}</Text>
                  <Text style={styles.featureBody}>{t(feature.bodyKey)}</Text>
                </View>
              </View>
            ))}
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
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  hero: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandIcon: { width: 34, height: 34, borderRadius: 10 },
  brandName: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: theme.colors.text,
  },
  kicker: {
    marginTop: theme.spacing.xl,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: theme.colors.textMuted,
  },
  display: {
    marginTop: 10,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "800",
    letterSpacing: -1.5,
    color: theme.colors.text,
  },
  lede: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    color: theme.colors.textMuted,
    maxWidth: 320,
  },
  body: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  featureCard: {
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingVertical: 14,
  },
  featureDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
  },
  featureText: { flex: 1, gap: 2 },
  featureTitle: { fontSize: 14.5, fontWeight: "700", color: theme.colors.text },
  featureBody: { fontSize: 13, lineHeight: 18, color: theme.colors.textMuted },
  actions: { marginTop: "auto", paddingTop: theme.spacing.xl, gap: 12 },
  pill: { borderRadius: theme.borderRadius.pill },
  legal: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    color: theme.colors.textMuted,
    paddingHorizontal: theme.spacing.sm,
  },
  legalLink: {
    color: theme.colors.text,
    fontWeight: "800",
  },
}));
