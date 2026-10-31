// C:\OOTDify\src\app\settings\help.tsx
// How to use Penggi: a beginner's walkthrough. Each section has a drawn
// picture of the real screen (features/help/GuideArt), numbered steps that
// match the buttons the user will actually see, and a "Show me" button that
// opens that screen.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCaptureModalStore } from "../../features/capture/captureModalStore";
import { GuideArt, type GuideArtKind } from "../../features/help/GuideArt";
import { AppButton } from "../../shared/components/AppButton";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import type { TranslationKey } from "../../shared/i18n/translate";

type IconName = keyof typeof Ionicons.glyphMap;

type Section = {
  key: string;
  icon: IconName;
  art: GuideArtKind;
  steps: number;
  /** Where "Show me" goes; "capture" opens the Add-a-piece flow. */
  go?: Href | "capture";
  soon?: boolean;
};

const SECTIONS: Section[] = [
  { key: "around", icon: "compass-outline", art: "tabs", steps: 6 },
  { key: "piece", icon: "camera-outline", art: "capture", steps: 4, go: "capture" },
  {
    key: "outfit",
    icon: "layers-outline",
    art: "outfit",
    steps: 4,
    go: { pathname: "/(tabs)/wardrobe", params: { section: "outfits" } },
  },
  {
    key: "plan",
    icon: "calendar-outline",
    art: "calendar",
    steps: 3,
    go: { pathname: "/(tabs)/wardrobe", params: { section: "outfits", view: "calendar" } },
  },
  { key: "ask", icon: "chatbubble-ellipses-outline", art: "chat", steps: 4, go: "/stylist" },
  { key: "social", icon: "people-outline", art: "community", steps: 4, go: "/(tabs)/community" },
  { key: "capsule", icon: "notifications-outline", art: "capsule", steps: 2, go: "/settings/general" },
  { key: "tryon", icon: "sparkles-outline", art: "tryon", steps: 3, soon: true },
];

const TIPS: TranslationKey[] = ["help.tip1", "help.tip2", "help.tip3", "help.tip4"];

const key = (s: string) => s as TranslationKey;

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const openCapture = useCaptureModalStore((s) => s.open);

  const go = (target: Section["go"]) => {
    if (!target) return;
    if (target === "capture") {
      router.back();
      openCapture();
      return;
    }
    router.push(target);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.navRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.navBtn}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.navTitle}>{t("settings.help.use")}</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Penggi introduces the guide. */}
        <View style={styles.hero}>
          <Image
            source={require("../../../assets/images/explaining-penggi.png")}
            style={styles.heroPenggi}
            contentFit="contain"
          />
          <View style={styles.heroText}>
            <Text style={styles.heroTitle} accessibilityRole="header">
              {t("help.hero.title")}
            </Text>
            <Text style={styles.heroBody}>{t("help.hero.body")}</Text>
          </View>
        </View>

        {/* Contents: jump-free, just a map of what's below. */}
        <View style={styles.contents}>
          {SECTIONS.map((s, i) => (
            <View key={s.key} style={styles.contentsItem}>
              <Text style={styles.contentsNum}>{i + 1}</Text>
              <Text style={styles.contentsText} numberOfLines={1}>
                {t(key(`help.${s.key}.title`))}
              </Text>
            </View>
          ))}
        </View>

        {SECTIONS.map((section, i) => (
          <View key={section.key} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardNum}>
                <Text style={styles.cardNumText}>{i + 1}</Text>
              </View>
              <View style={styles.cardHeadText}>
                <View style={styles.titleRow}>
                  <Ionicons name={section.icon} size={17} color={theme.colors.brand} />
                  <Text style={styles.cardTitle}>{t(key(`help.${section.key}.title`))}</Text>
                  {section.soon ? (
                    <View style={styles.soon}>
                      <Text style={styles.soonText}>{t("help.soon")}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.cardBody}>{t(key(`help.${section.key}.body`))}</Text>
              </View>
            </View>

            <GuideArt kind={section.art} />

            <View style={styles.steps}>
              {Array.from({ length: section.steps }).map((_, n) => (
                <View key={n} style={styles.step}>
                  <View style={styles.stepDot}>
                    <Text style={styles.stepDotText}>{n + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{t(key(`help.${section.key}.step${n + 1}`))}</Text>
                </View>
              ))}
            </View>

            {section.go ? (
              <AppButton
                label={t("help.show_me")}
                icon="arrow-forward"
                variant="secondary"
                onPress={() => go(section.go)}
              />
            ) : null}
          </View>
        ))}

        <Text style={styles.sectionLabel}>{t("help.tips.label")}</Text>
        <View style={styles.tips}>
          {TIPS.map((tip) => (
            <View key={tip} style={styles.tipRow}>
              <Ionicons name="bulb-outline" size={18} color={theme.colors.accent} />
              <Text style={styles.tipText}>{t(tip)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  navBtn: { padding: 6 },
  navTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  content: { padding: 16, gap: 14 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroPenggi: { width: 92, height: 92 },
  heroText: { flex: 1, minWidth: 0, gap: 4 },
  heroTitle: { fontSize: 21, fontWeight: "700", letterSpacing: -0.4, color: theme.colors.text },
  heroBody: { fontSize: 13.5, lineHeight: 19, color: theme.colors.textMuted },
  contents: {
    padding: 12,
    gap: 6,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
  },
  contentsItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  contentsNum: { width: 18, fontSize: 12, fontWeight: "700", color: theme.colors.brand, textAlign: "center" },
  contentsText: { flex: 1, fontSize: 13, color: theme.colors.text },
  card: {
    gap: 12,
    padding: 14,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
  },
  cardHead: { flexDirection: "row", gap: 12 },
  cardNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  cardNumText: { color: theme.colors.onPrimary, fontWeight: "700", fontSize: 13 },
  cardHeadText: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  cardBody: { fontSize: 13, lineHeight: 19, color: theme.colors.textMuted },
  soon: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  soonText: { fontSize: 10.5, fontWeight: "700", color: theme.colors.accent },
  steps: { gap: 10 },
  step: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  stepDot: {
    width: 20,
    height: 20,
    marginTop: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.brand,
  },
  stepDotText: { fontSize: 11, fontWeight: "700", color: theme.colors.onBrand },
  stepText: { flex: 1, fontSize: 13.5, lineHeight: 20, color: theme.colors.text },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  tips: {
    padding: 14,
    gap: 12,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
  },
  tipRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  tipText: { flex: 1, fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
}));
