// C:\OOTDify\src\app\settings\help.tsx
// How to use OOTDify — a short, real walkthrough of the app's core flows.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import type { TranslationKey } from "../../shared/i18n/translate";

type IconName = keyof typeof Ionicons.glyphMap;

const STEPS: { icon: IconName; titleKey: TranslationKey; bodyKey: TranslationKey }[] = [
  { icon: "shirt-outline", titleKey: "settings.help_screen.step1.title", bodyKey: "settings.help_screen.step1.body" },
  { icon: "sparkles-outline", titleKey: "settings.help_screen.step2.title", bodyKey: "settings.help_screen.step2.body" },
  { icon: "cube-outline", titleKey: "settings.help_screen.step3.title", bodyKey: "settings.help_screen.step3.body" },
  { icon: "calendar-outline", titleKey: "settings.help_screen.step4.title", bodyKey: "settings.help_screen.step4.body" },
  { icon: "heart-outline", titleKey: "settings.help_screen.step5.title", bodyKey: "settings.help_screen.step5.body" },
];

const TIPS: TranslationKey[] = [
  "settings.help_screen.tip1",
  "settings.help_screen.tip2",
  "settings.help_screen.tip3",
];

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.navRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.navBtn}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.navTitle}>{t("settings.help.use")}</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          {t("settings.help_screen.intro")}
        </Text>

        {STEPS.map((step, i) => (
          <View key={step.titleKey} style={styles.stepCard}>
            <View style={styles.stepIndex}>
              <Text style={styles.stepIndexText}>{i + 1}</Text>
            </View>
            <View style={styles.stepBody}>
              <View style={styles.stepTitleRow}>
                <Ionicons name={step.icon} size={18} color={theme.colors.primary} />
                <Text style={styles.stepTitle}>{t(step.titleKey)}</Text>
              </View>
              <Text style={styles.stepText}>{t(step.bodyKey)}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionLabel}>{t("settings.help_screen.tips.label")}</Text>
        <View style={styles.card}>
          {TIPS.map((tip) => (
            <View key={tip} style={styles.tipRow}>
              <Ionicons name="bulb-outline" size={18} color={theme.colors.warning} />
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
  navTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  intro: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
  stepCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: 14,
  },
  stepIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIndexText: { color: theme.colors.onPrimary, fontWeight: "800", fontSize: 13 },
  stepBody: { flex: 1, minWidth: 0, gap: 4 },
  stepTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepTitle: { fontSize: 14.5, fontWeight: "700", color: theme.colors.text },
  stepText: { fontSize: 12.5, color: theme.colors.textMuted, lineHeight: 18 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginTop: 10,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 12,
  },
  tipRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  tipText: { flex: 1, fontSize: 12.5, color: theme.colors.textMuted, lineHeight: 18 },
}));
