// C:\OOTDify\src\features\legal\LegalDocument.tsx
// Shared layout for the Terms of Service and Privacy Policy screens, matching
// the signed-out clothes-rail look: a pinstriped page, the document title on a
// hang-tag under a rail, and the clauses on a single paper sheet. Clauses are
// numbered because they are a real, citable sequence. Always drawn light, like
// the signed-out screens it is opened from.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Pinstripes, Rail, useSwing } from "../../shared/components/ClothesRail";
import type { Theme } from "../../shared/config/theme";
import type { TranslationKey } from "../../shared/i18n/translate";
import { useT } from "../../shared/i18n/useT";
import { makeStyles } from "../../shared/theme/makeStyles";
import { ForcedSchemeProvider, useAppTheme } from "../../shared/theme/ThemeProvider";

export interface LegalSection {
  titleKey: TranslationKey;
  bodyKeys: TranslationKey[];
}

interface Props {
  title: string;
  updated: string;
  sections: LegalSection[];
  reviewFlag: string;
}

const RING_AT = 0.5;

export function LegalDocument(props: Props) {
  return (
    <ForcedSchemeProvider scheme="light">
      <StatusBar style="dark" />
      <LegalDocumentBody {...props} />
    </ForcedSchemeProvider>
  );
}

function LegalDocumentBody({ title, updated, sections, reviewFlag }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const rotate = useSwing({ from: 7, rest: -1.5, duration: 1000 });

  // Opened from the landing page (or a deep link / web reload, where there is
  // no history entry to pop) — fall back to the landing page rather than
  // leaving the reader stuck.
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(auth)");
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Pinstripes />
      <View style={styles.navRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("privacy.policy.back_a11y")}
          onPress={goBack}
          hitSlop={8}
          style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >
        <Rail rings={[RING_AT]} />
        <Animated.View style={[styles.hanger, { transform: [{ rotate }] }]}>
          <View style={styles.string} />
          <View style={styles.tag}>
            <View style={styles.hole} />
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.updated}>{updated}</Text>
          </View>
        </Animated.View>

        <View style={styles.sheet}>
          {sections.map((section, index) => (
            <View
              key={section.titleKey}
              style={[styles.clause, index > 0 && styles.clauseRule]}
            >
              <Text style={styles.number}>{index + 1}</Text>
              <View style={styles.clauseBody}>
                <Text style={styles.h}>{t(section.titleKey)}</Text>
                {section.bodyKeys.map((bodyKey) => (
                  <Text key={bodyKey} style={styles.p}>
                    {t(bodyKey)}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.reviewFlag}>{reviewFlag}</Text>
      </ScrollView>
    </View>
  );
}

const HOLE = 10;
const NUMBER_COL = 26;

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  navRow: { paddingHorizontal: theme.spacing.md, paddingBottom: 8 },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  pressed: { opacity: 0.7 },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: theme.spacing.md,
    paddingTop: 12,
  },

  // Title tag
  hanger: { alignItems: "center", transformOrigin: "top" },
  string: {
    width: StyleSheet.hairlineWidth * 2,
    height: 22,
    backgroundColor: theme.colors.textMuted,
  },
  tag: {
    minWidth: 220,
    maxWidth: "86%",
    alignItems: "center",
    paddingTop: HOLE + 18,
    paddingHorizontal: 22,
    paddingBottom: 16,
    gap: 4,
    borderRadius: 14,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  hole: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    width: HOLE,
    height: HOLE,
    borderRadius: HOLE / 2,
    backgroundColor: theme.colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  title: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
    color: theme.colors.text,
  },
  updated: { fontSize: 12, textAlign: "center", color: theme.colors.textMuted },

  // Paper sheet
  sheet: {
    marginTop: 24,
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  clause: { flexDirection: "row", paddingVertical: 16 },
  clauseRule: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  number: {
    width: NUMBER_COL,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: theme.colors.textMuted,
  },
  clauseBody: { flex: 1, minWidth: 0, gap: 6 },
  h: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: theme.colors.text },
  p: { fontSize: 13.5, lineHeight: 21, color: theme.colors.text },
  reviewFlag: {
    marginTop: 16,
    paddingHorizontal: 4,
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 18,
    color: theme.colors.textMuted,
  },
}));
