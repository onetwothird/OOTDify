// C:\OOTDify\src\app\settings\about.tsx
// About — version, update check, release notes, feedback, trademarks.
// The tab is selected by the `?tab=` query (Profile's About rows deep-link
// straight to the right section); default is Updates.
//
// Everything real: version/build come from expo-application's native values,
// the update check compares against the published store listing, feedback
// opens a real mail composer pre-filled with device diagnostics, and the
// trademarks list only names libraries this build actually ships.
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  checkForStoreUpdate,
  UpdateCheckResult,
} from "../../features/settings/updates";
import { AppButton } from "../../shared/components/AppButton";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import type { TranslationKey } from "../../shared/i18n/translate";
import { toast } from "../../shared/lib/toast";


type TabKey = "about" | "trademarks" | "updates" | "whatsnew" | "feedback";

// Two groups share this route: "About" and "Updates & feedback". Settings links
// into one group, and the screen only shows that group's tabs and title.
const ABOUT_TABS: { key: TabKey; labelKey: TranslationKey }[] = [
  { key: "about", labelKey: "settings.about_screen.tab.about" },
  { key: "trademarks", labelKey: "settings.about_screen.tab.trademarks" },
];
const UPDATE_TABS: { key: TabKey; labelKey: TranslationKey }[] = [
  { key: "updates", labelKey: "settings.about_screen.tab.updates" },
  { key: "whatsnew", labelKey: "settings.about_screen.tab.whatsnew" },
  { key: "feedback", labelKey: "settings.about_screen.tab.feedback" },
];
const ALL_TABS = [...ABOUT_TABS, ...UPDATE_TABS];

/** Optional support address: expo.extra.supportEmail in app.json, if set. */
function supportEmail(): string {
  const extra = Constants.expoConfig?.extra as
    | { supportEmail?: unknown }
    | undefined;
  return typeof extra?.supportEmail === "string" ? extra.supportEmail : "";
}

function versionLabel(): string {
  const version = Application.nativeApplicationVersion;
  const build = Application.nativeBuildVersion;
  if (version && build) return `${version} (${build})`;
  return version ?? "unknown";
}

const RELEASE_NOTES: { versionKey: TranslationKey; dateKey: TranslationKey; itemKeys: TranslationKey[] }[] = [
  {
    versionKey: "settings.about_screen.release_notes.current_version",
    dateKey: "settings.about_screen.release_notes.current_date",
    itemKeys: [
      "settings.about_screen.release_notes.item1",
      "settings.about_screen.release_notes.item2",
      "settings.about_screen.release_notes.item3",
      "settings.about_screen.release_notes.item4",
    ],
  },
];

const TRADEMARKS: { name: string; noteKey: TranslationKey }[] = [
  { name: "Expo", noteKey: "settings.about_screen.trademarks.expo" },
  { name: "React Native", noteKey: "settings.about_screen.trademarks.react_native" },
  { name: "Supabase", noteKey: "settings.about_screen.trademarks.supabase" },
  { name: "Ionicons", noteKey: "settings.about_screen.trademarks.ionicons" },
];

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const params = useLocalSearchParams<{ tab?: string }>();
  const requested = typeof params.tab === "string" ? params.tab : "";
  const active: TabKey = ALL_TABS.some((tab) => tab.key === requested)
    ? (requested as TabKey)
    : "about";
  const isUpdates = UPDATE_TABS.some((tab) => tab.key === active);
  const tabs = isUpdates ? UPDATE_TABS : ABOUT_TABS;

  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(null);

  const runUpdateCheck = async () => {
    if (checking) return;
    setChecking(true);
    setCheckResult(null);
    try {
      setCheckResult(await checkForStoreUpdate());
    } finally {
      setChecking(false);
    }
  };

  const sendFeedback = async () => {
    const subject = `OOTDify feedback (v${versionLabel()})`;
    const body = [
      "",
      "",
      "---",
      `App: ${versionLabel()}`,
      `Platform: ${Platform.OS} ${Platform.Version}`,
      `Device: ${Device.modelName ?? "unknown"}`,
      "Feedback:",
      "",
    ].join("\n");
    const to = supportEmail();
    const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      toast.error(
        t("settings.about_screen.feedback.mail_error.title"),
        t("settings.about_screen.feedback.mail_error.message"),
      );
    }
  };


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
        <Text style={styles.navTitle}>
          {isUpdates ? t("settings.about_screen.updates_title") : t("settings.about_screen.title")}
        </Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ------------------------------------------------ App identity */}
        <View style={styles.appCard}>
          <View style={styles.appIcon}>
            <Ionicons name="shirt" size={26} color={theme.colors.onPrimary} />
          </View>
          <View style={styles.appBody}>
            <Text style={styles.appName}>OOTDify</Text>
            <Text style={styles.appVersion}>
              {t("settings.version", { version: versionLabel() })}
            </Text>
          </View>
        </View>

        {/* ------------------------------------------- Segmented tabs */}
        <View style={styles.segment} accessibilityRole="tablist">
          {tabs.map((tab) => {
            const selected = active === tab.key;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => router.setParams({ tab: tab.key })}
                style={[styles.segmentItem, selected && styles.segmentItemActive]}
              >
                <Ionicons
                  name={TAB_ICONS[tab.key]}
                  size={16}
                  color={selected ? theme.colors.onPrimary : theme.colors.textMuted}
                />
                <Text
                  style={[styles.segmentText, selected && styles.segmentTextActive]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {t(tab.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {active === "about" ? (
          <View style={styles.card}>
            <SectionHead icon="information-circle-outline" title="OOTDify" />
            <Text style={styles.body}>{t("settings.about_screen.about.body")}</Text>
          </View>
        ) : null}

        {active === "updates" ? (
          <View style={styles.card}>
            <SectionHead icon="cloud-download-outline" title={t("settings.about_screen.tab.updates")} />
            {checkResult ? (
              <View
                style={[
                  styles.resultBox,
                  checkResult.status === "update-available" && styles.resultBoxHighlight,
                ]}
              >
                <Ionicons
                  name={
                    checkResult.status === "update-available"
                      ? "arrow-up-circle"
                      : checkResult.status === "check-failed"
                        ? "alert-circle-outline"
                        : "checkmark-circle"
                  }
                  size={20}
                  color={
                    checkResult.status === "update-available"
                      ? theme.colors.primary
                      : checkResult.status === "check-failed"
                        ? theme.colors.warning
                        : theme.colors.success
                  }
                />
                <Text style={styles.resultText}>{checkResult.message}</Text>
              </View>
            ) : null}
            <AppButton
              label={t("settings.about.updates")}
              icon="refresh"
              loading={checking}
              disabled={checking}
              onPress={() => void runUpdateCheck()}
            />
            <Text style={styles.smallNote}>{t("settings.about_screen.update_note")}</Text>
          </View>
        ) : null}

        {active === "whatsnew" ? (
          <>
            {RELEASE_NOTES.map((note) => (
              <View key={note.versionKey} style={styles.card}>
                <View style={styles.noteTop}>
                  <View style={styles.versionBadge}>
                    <Text style={styles.versionBadgeText}>{t(note.versionKey)}</Text>
                  </View>
                  <Text style={styles.noteDate}>{t(note.dateKey)}</Text>
                </View>
                <View style={styles.noteList}>
                  {note.itemKeys.map((item) => (
                    <View key={item} style={styles.bulletRow}>
                      <Ionicons name="sparkles" size={14} color={theme.colors.primary} style={styles.bulletIcon} />
                      <Text style={styles.bulletText}>{t(item)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
            <Text style={[styles.smallNote, styles.outerNote]}>
              {t("settings.about_screen.release_notes.note")}
            </Text>
          </>
        ) : null}

        {active === "feedback" ? (
          <View style={styles.card}>
            <SectionHead icon="chatbox-ellipses-outline" title={t("settings.about_screen.tab.feedback")} />
            <Text style={styles.body}>{t("settings.about_screen.feedback.body")}</Text>
            <AppButton
              label={t("settings.about_screen.feedback.open")}
              icon="mail-outline"
              onPress={() => void sendFeedback()}
            />
            <Text style={styles.smallNote}>
              {supportEmail()
                ? t("settings.about_screen.feedback.note_with_email", { email: supportEmail() })
                : t("settings.about_screen.feedback.note_no_email")}
            </Text>
          </View>
        ) : null}

        {active === "trademarks" ? (
          <>
            <Text style={[styles.body, styles.outerNote]}>
              {t("settings.about_screen.trademarks.body")}
            </Text>
            <View style={[styles.card, styles.listCard]}>
              {TRADEMARKS.map((row, i) => (
                <View
                  key={row.name}
                  style={[styles.tmRow, i < TRADEMARKS.length - 1 && styles.tmRowDivider]}
                >
                  <View style={styles.tmTile}>
                    <Text style={styles.tmTileText}>{row.name[0]}</Text>
                  </View>
                  <View style={styles.tmBody}>
                    <Text style={styles.tmName}>{row.name}</Text>
                    <Text style={styles.tmNote}>{t(row.noteKey)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const TAB_ICONS: Record<TabKey, keyof typeof Ionicons.glyphMap> = {
  about: "information-circle-outline",
  updates: "cloud-download-outline",
  whatsnew: "sparkles-outline",
  feedback: "chatbox-ellipses-outline",
  trademarks: "ribbon-outline",
};

function SectionHead({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={16} color={theme.colors.text} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
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
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },

  appCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: 16,
  },
  appIcon: {
    width: 52,
    height: 52,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  appBody: { flex: 1, minWidth: 0 },
  appName: { fontSize: 20, fontWeight: "700", letterSpacing: -0.4, color: theme.colors.text },
  appVersion: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 2 },

  segment: {
    flexDirection: "row",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.md,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: theme.borderRadius.sm,
  },
  segmentItemActive: { backgroundColor: theme.colors.primary },
  segmentText: { fontSize: 11.5, fontWeight: "600", color: theme.colors.textMuted },
  segmentTextActive: { color: theme.colors.onPrimary },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 14,
  },
  listCard: { paddingVertical: 4, gap: 0 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  body: { fontSize: 13.5, lineHeight: 20, color: theme.colors.text },
  smallNote: { fontSize: 11.5, lineHeight: 17, color: theme.colors.textMuted },
  outerNote: { paddingHorizontal: 4 },

  resultBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  resultBoxHighlight: { borderWidth: 1, borderColor: theme.colors.primary },
  resultText: { flex: 1, fontSize: 13, lineHeight: 18, color: theme.colors.text },

  noteTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  versionBadge: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  versionBadgeText: { fontSize: 12, fontWeight: "700", color: theme.colors.onPrimary },
  noteDate: { fontSize: 12, fontWeight: "600", color: theme.colors.textMuted },
  noteList: { gap: 10 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bulletIcon: { marginTop: 3 },
  bulletText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: theme.colors.text },

  tmRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  tmRowDivider: { borderBottomWidth: 0.5, borderBottomColor: theme.colors.border },
  tmTile: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  tmTileText: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  tmBody: { flex: 1, minWidth: 0, gap: 2 },
  tmName: { fontSize: 14.5, fontWeight: "700", color: theme.colors.text },
  tmNote: { fontSize: 12.5, lineHeight: 17, color: theme.colors.textMuted },
}));
