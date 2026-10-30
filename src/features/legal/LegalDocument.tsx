// C:\OOTDify\src\features\legal\LegalDocument.tsx
// Shared layout for the Terms of Service and Privacy Policy screens. Kept
// plain on purpose — it is a document to read: a white page, a quiet header
// (back, title, last updated) with a thin reading-progress line under it, and
// the clauses in comfortable type. Clauses are numbered because they are a
// real, citable sequence. Always drawn light, like the signed-out screens it
// is opened from.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const [scrollY] = useState(() => new Animated.Value(0));
  const [sizes, setSizes] = useState({ content: 0, view: 0 });

  // Opened from the landing page (or a deep link / web reload, where there is
  // no history entry to pop) — fall back to the landing page rather than
  // leaving the reader stuck.
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(auth)");
  };

  const readable = Math.max(1, sizes.content - sizes.view);
  const progress = scrollY.interpolate({ inputRange: [0, readable], outputRange: [0, 1], extrapolate: "clamp" });

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("privacy.policy.back_a11y")}
          onPress={goBack}
          hitSlop={8}
          style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.updated}>{updated}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { transform: [{ scaleX: progress }] }]} />
      </View>

      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onLayout={(e) => {
          const view = e.nativeEvent.layout.height;
          setSizes((s) => ({ ...s, view }));
        }}
        onContentSizeChange={(_, content) => setSizes((s) => ({ ...s, content }))}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        {sections.map((section, index) => (
          <View key={section.titleKey} style={styles.clause}>
            <View style={styles.clauseHead}>
              <Text style={styles.number}>{index + 1}.</Text>
              <Text style={styles.h}>{t(section.titleKey)}</Text>
            </View>
            {section.bodyKeys.map((bodyKey) => (
              <Text key={bodyKey} style={styles.p}>
                {t(bodyKey)}
              </Text>
            ))}
          </View>
        ))}

        <Text style={styles.reviewFlag}>{reviewFlag}</Text>
      </Animated.ScrollView>
    </View>
  );
}

const NUMBER_COL = 24;

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.surface },
  pressed: { opacity: 0.7 },

  header: { paddingHorizontal: theme.spacing.lg, paddingBottom: 14 },
  navBtn: {
    width: 40,
    height: 40,
    marginLeft: -8,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: 10,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
    letterSpacing: -0.6,
    color: theme.colors.text,
  },
  updated: { fontSize: 13, marginTop: 4, color: theme.colors.textMuted },
  track: { height: 2, backgroundColor: theme.colors.border },
  fill: { height: 2, width: "100%", transformOrigin: "left", backgroundColor: theme.colors.brand },

  content: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  clause: { paddingVertical: 14, gap: 8 },
  clauseHead: { flexDirection: "row", alignItems: "baseline" },
  number: {
    width: NUMBER_COL,
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  h: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: "700", color: theme.colors.text },
  p: { fontSize: 15, lineHeight: 24, color: theme.colors.text, paddingLeft: NUMBER_COL },
  reviewFlag: {
    marginTop: theme.spacing.md,
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 18,
    color: theme.colors.textMuted,
  },
}));
