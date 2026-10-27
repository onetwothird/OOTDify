// C:\OOTDify\src\app\privacy\policy.tsx
// In-app Privacy Policy. Written to be accurate and specific: we never claim
// "100% secure", we disclose the AI backend, third-party processing and the
// storage model truthfully.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import type { TranslationKey } from "../../shared/i18n/translate";
import { TERMS_DISPLAY_DATE, TERMS_VERSION } from "../../shared/config/legal";

const SECTIONS: { titleKey: TranslationKey; bodyKeys: TranslationKey[] }[] = [
  { titleKey: "privacy.policy.s1.title", bodyKeys: ["privacy.policy.s1.body"] },
  { titleKey: "privacy.policy.s2.title", bodyKeys: ["privacy.policy.s2.body"] },
  { titleKey: "privacy.policy.s3.title", bodyKeys: ["privacy.policy.s3.body"] },
  { titleKey: "privacy.policy.s4.title", bodyKeys: ["privacy.policy.s4.body1", "privacy.policy.s4.body2", "privacy.policy.s4.body3"] },
  { titleKey: "privacy.policy.s5.title", bodyKeys: ["privacy.policy.s5.body"] },
  { titleKey: "privacy.policy.s6.title", bodyKeys: ["privacy.policy.s6.body"] },
  { titleKey: "privacy.policy.s7.title", bodyKeys: ["privacy.policy.s7.body"] },
  { titleKey: "privacy.policy.s8.title", bodyKeys: ["privacy.policy.s8.body"] },
  { titleKey: "privacy.policy.s9.title", bodyKeys: ["privacy.policy.s9.body"] },
  { titleKey: "privacy.policy.s10.title", bodyKeys: ["privacy.policy.s10.body"] },
  { titleKey: "privacy.policy.s11.title", bodyKeys: ["privacy.policy.s11.body"] },
];

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();

  // Opened from the landing page (or a deep link / web reload, where there is
  // no history entry to pop) — fall back to the landing page rather than
  // leaving the reader stuck.
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(auth)");
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.navRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("privacy.policy.back_a11y")} onPress={goBack} hitSlop={8} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.navTitle}>{t("settings.about.privacy")}</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>
          {t("privacy.policy.updated", { version: TERMS_VERSION, date: TERMS_DISPLAY_DATE })}
        </Text>

        {SECTIONS.map((section) => (
          <Section key={section.titleKey} title={t(section.titleKey)}>
            {section.bodyKeys.map((bodyKey) => (
              <P key={bodyKey}>{t(bodyKey)}</P>
            ))}
          </Section>
        ))}

        <Text style={styles.reviewFlag}>
          {t("privacy.policy.review_flag")}
        </Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.h}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.p}>{children}</Text>;
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
  content: { padding: 16, paddingBottom: 48 },
  updated: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 16 },
  section: { marginBottom: 18 },
  h: { fontSize: 15, fontWeight: "800", color: theme.colors.text, marginBottom: 6 },
  p: { fontSize: 13.5, color: theme.colors.text, lineHeight: 20 },
  reviewFlag: {
    fontSize: 12,
    fontStyle: "italic",
    color: theme.colors.textMuted,
    lineHeight: 18,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
    paddingTop: 12,
    marginTop: 4,
  },
}));
