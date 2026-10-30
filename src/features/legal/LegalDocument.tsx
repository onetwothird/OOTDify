// C:\OOTDify\src\features\legal\LegalDocument.tsx
// Shared layout for the Terms of Service and Privacy Policy screens, built for
// reading: a fixed brand-blue header (back, title, last updated) whose bottom
// edge fills as a reading-progress bar, a contents list that jumps to any
// clause, the clauses themselves with roomy type, and a back-to-top button
// once you are deep in. Clauses are numbered because they are a real, citable
// sequence. Always drawn light, like the signed-out screens it is opened from.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { type ComponentRef, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
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

/** Scrolled this far, the back-to-top button appears. */
const SHOW_TOP_AFTER = 600;
/** Room left above a clause when jumping to it. */
const JUMP_GAP = 12;

export function LegalDocument(props: Props) {
  return (
    <ForcedSchemeProvider scheme="light">
      <StatusBar style="light" />
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
  // Only used from tap handlers, never read during render.
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const [scrollY] = useState(() => new Animated.Value(0));
  const [sizes, setSizes] = useState({ content: 0, view: 0 });
  const [offsets, setOffsets] = useState<Record<number, number>>({});
  const [showTop, setShowTop] = useState(false);

  // Opened from the landing page (or a deep link / web reload, where there is
  // no history entry to pop) — fall back to the landing page rather than
  // leaving the reader stuck.
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(auth)");
  };

  const readable = Math.max(1, sizes.content - sizes.view);
  const progress = scrollY.interpolate({ inputRange: [0, readable], outputRange: [0, 1], extrapolate: "clamp" });

  const jumpTo = (index: number) => {
    const y = offsets[index];
    if (y !== undefined) scroller.current?.scrollTo({ y: Math.max(0, y - JUMP_GAP), animated: true });
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("privacy.policy.back_a11y")}
            onPress={goBack}
            hitSlop={8}
            style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={20} color={theme.colors.brand} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.updated}>{updated}</Text>
          </View>
        </View>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { transform: [{ scaleX: progress }] }]} />
        </View>
      </View>

      <ScrollView
        ref={scroller}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 72 }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onLayout={(e) => {
          const view = e.nativeEvent.layout.height;
          setSizes((s) => ({ ...s, view }));
        }}
        onContentSizeChange={(_, content) => setSizes((s) => ({ ...s, content }))}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
          listener: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
            const past = e.nativeEvent.contentOffset.y > SHOW_TOP_AFTER;
            setShowTop((shown) => (shown === past ? shown : past));
          },
        })}
      >
        <View style={styles.contents}>
          <Text style={styles.contentsTitle}>{t("legal.contents")}</Text>
          {sections.map((section, index) => (
            <Pressable
              key={section.titleKey}
              accessibilityRole="button"
              onPress={() => jumpTo(index)}
              style={({ pressed }) => [styles.contentsRow, pressed && styles.pressed]}
            >
              <Text style={styles.contentsNumber}>{index + 1}</Text>
              <Text style={styles.contentsLabel} numberOfLines={1}>
                {t(section.titleKey)}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </Pressable>
          ))}
        </View>

        {sections.map((section, index) => (
          <View
            key={section.titleKey}
            style={styles.clause}
            onLayout={(e) => {
              const y = e.nativeEvent.layout.y;
              setOffsets((o) => (o[index] === y ? o : { ...o, [index]: y }));
            }}
          >
            <View style={styles.clauseHead}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{index + 1}</Text>
              </View>
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
      </ScrollView>

      {showTop ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("legal.top")}
          onPress={() => scroller.current?.scrollTo({ y: 0, animated: true })}
          style={({ pressed }) => [styles.topBtn, { bottom: insets.bottom + 20 }, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-up" size={16} color={theme.colors.onBrand} />
          <Text style={styles.topText}>{t("legal.top")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const BADGE = 26;

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.surface },
  pressed: { opacity: 0.75 },

  // Header
  header: { backgroundColor: theme.colors.brand },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 16,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, lineHeight: 27, fontWeight: "700", letterSpacing: -0.5, color: theme.colors.onBrand },
  updated: { fontSize: 12.5, marginTop: 2, color: theme.colors.onPrimarySubtle },
  track: { height: 4, backgroundColor: theme.colors.onPrimary },
  fill: { height: 4, width: "100%", transformOrigin: "left", backgroundColor: theme.colors.accentBright },

  content: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },

  // Contents
  contents: {
    padding: 14,
    paddingBottom: 6,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primaryMuted,
    marginBottom: theme.spacing.lg,
  },
  contentsTitle: { fontSize: 14, fontWeight: "700", color: theme.colors.text, marginBottom: 4 },
  contentsRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  contentsNumber: {
    width: 20,
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.brand,
    fontVariant: ["tabular-nums"],
  },
  contentsLabel: { flex: 1, fontSize: 14, color: theme.colors.text },

  // Clauses
  clause: { paddingVertical: theme.spacing.md, gap: 10 },
  clauseHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.brand,
  },
  badgeText: { fontSize: 13, fontWeight: "700", color: theme.colors.onBrand, fontVariant: ["tabular-nums"] },
  h: { flex: 1, fontSize: 17, lineHeight: 23, fontWeight: "700", letterSpacing: -0.2, color: theme.colors.text },
  p: { fontSize: 15, lineHeight: 24, color: theme.colors.text, paddingLeft: BADGE + 10 },
  reviewFlag: {
    marginTop: theme.spacing.md,
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 18,
    color: theme.colors.textMuted,
  },

  topBtn: {
    position: "absolute",
    right: theme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.brand,
  },
  topText: { fontSize: 13, fontWeight: "700", color: theme.colors.onBrand },
}));
