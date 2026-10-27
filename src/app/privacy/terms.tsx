// C:\OOTDify\src\app\privacy\terms.tsx
// In-app Terms of Service — honest, readable and specific to how the app and
// its AI backend behave today (including the try-on integration boundary).
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
  { titleKey: "privacy.terms.s1.title", bodyKeys: ["privacy.terms.s1.body"] },
  { titleKey: "privacy.terms.s2.title", bodyKeys: ["privacy.terms.s2.body"] },
  { titleKey: "privacy.terms.s3.title", bodyKeys: ["privacy.terms.s3.body1", "privacy.terms.s3.body2"] },
  { titleKey: "privacy.terms.s4.title", bodyKeys: ["privacy.terms.s4.body"] },
  { titleKey: "privacy.terms.s5.title", bodyKeys: ["privacy.terms.s5.body"] },
  { titleKey: "privacy.terms.s6.title", bodyKeys: ["privacy.terms.s6.body"] },
  { titleKey: "privacy.terms.s7.title", bodyKeys: ["privacy.terms.s7.body"] },
  { titleKey: "privacy.terms.s8.title", bodyKeys: ["privacy.terms.s8.body"] },
  { titleKey: "privacy.terms.s9.title", bodyKeys: ["privacy.terms.s9.body"] },
  { titleKey: "privacy.terms.s10.title", bodyKeys: ["privacy.terms.s10.body"] },
  { titleKey: "privacy.terms.s11.title", bodyKeys: ["privacy.terms.s11.body"] },
  { titleKey: "privacy.terms.s12.title", bodyKeys: ["privacy.terms.s12.body"] },
];

export default function TermsScreen() {
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
        <Text style={styles.navTitle}>{t("profile.privacy.terms")}</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>
          {t("privacy.terms.updated", { version: TERMS_VERSION, date: TERMS_DISPLAY_DATE })}
        </Text>

        {SECTIONS.map((section) => (
          <Section key={section.titleKey} title={t(section.titleKey)}>
            {section.bodyKeys.map((bodyKey) => (
              <P key={bodyKey}>{t(bodyKey)}</P>
            ))}
          </Section>
        ))}

        <Text style={styles.reviewFlag}>
          {t("privacy.terms.review_flag")}
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
