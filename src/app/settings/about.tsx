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
  ActivityIndicator,
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
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import type { TranslationKey } from "../../shared/i18n/translate";
import { toast } from "../../shared/lib/toast";


type TabKey = "updates" | "whatsnew" | "feedback" | "trademarks";

const TABS: { key: TabKey; labelKey: TranslationKey }[] = [
  { key: "updates", labelKey: "settings.about_screen.tab.updates" },
  { key: "whatsnew", labelKey: "settings.about_screen.tab.whatsnew" },
  { key: "feedback", labelKey: "settings.about_screen.tab.feedback" },
  { key: "trademarks", labelKey: "settings.about_screen.tab.trademarks" },
];

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
  { name: "Inter", noteKey: "settings.about_screen.trademarks.inter" },
];

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const params = useLocalSearchParams<{ tab?: string }>();
  const requested = typeof params.tab === "string" ? params.tab : "";
  const active: TabKey = TABS.some((tab) => tab.key === requested)
    ? (requested as TabKey)
    : "updates";

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
        <Text style={styles.navTitle}>{t("settings.about_screen.title")}</Text>
        <View style={{ width: 34 }} />
      </View>

      {/* ------------------------------------------------------- Tab chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active === tab.key }}
            onPress={() =>
              router.setParams({ tab: tab.key })
            }
            style={[styles.tabChip, active === tab.key && styles.tabChipActive]}
          >
            <Text
              style={[styles.tabText, active === tab.key && styles.tabTextActive]}
            >
              {t(tab.labelKey)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.brand}>OOTDify</Text>

        {active === "updates" ? (
          <>
            <Text style={styles.version}>{t("settings.version", { version: versionLabel() })}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: checking, busy: checking }}
              disabled={checking}
              onPress={() => void runUpdateCheck()}
              style={({ pressed }) => [
                styles.checkBtn,
                pressed && !checking && { opacity: 0.85 },
                checking && { opacity: 0.6 },
              ]}
            >
              {checking ? (
                <ActivityIndicator size="small" color={theme.colors.onPrimary} />
              ) : (
                <Ionicons name="cloud-download-outline" size={17} color={theme.colors.onPrimary} />
              )}
              <Text style={styles.checkLabel}>{t("settings.about.updates")}</Text>
            </Pressable>
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
                        : "checkmark-circle-outline"
                  }
                  size={18}
                  color={
                    checkResult.status === "update-available"
                      ? theme.colors.primary
                      : theme.colors.textMuted
                  }
                />
                <Text style={styles.resultText}>{checkResult.message}</Text>
              </View>
            ) : null}
            <Text style={styles.smallNote}>
              {t("settings.about_screen.update_note")}
            </Text>
          </>
        ) : null}

        {active === "whatsnew" ? (
          <>
            {RELEASE_NOTES.map((note) => (
              <View key={note.versionKey} style={styles.card}>
                <Text style={styles.noteHead}>
                  {t("settings.about_screen.release_notes.header", {
                    version: t(note.versionKey),
                    date: t(note.dateKey),
                  })}
                </Text>
                {note.itemKeys.map((item) => (
                  <View key={item} style={styles.bulletRow}>
                    <View style={styles.bullet} />
                    <Text style={styles.bulletText}>{t(item)}</Text>
                  </View>
                ))}
              </View>
            ))}
            <Text style={styles.smallNote}>
              {t("settings.about_screen.release_notes.note")}
            </Text>
          </>
        ) : null}

        {active === "feedback" ? (
          <>
            <Text style={styles.body}>
              {t("settings.about_screen.feedback.body")}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void sendFeedback()}
              style={({ pressed }) => [styles.checkBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="chatbox-ellipses-outline" size={17} color={theme.colors.onPrimary} />
              <Text style={styles.checkLabel}>{t("settings.about_screen.feedback.open")}</Text>
            </Pressable>
            <Text style={styles.smallNote}>
              {supportEmail()
                ? t("settings.about_screen.feedback.note_with_email", { email: supportEmail() })
                : t("settings.about_screen.feedback.note_no_email")}
            </Text>
          </>
        ) : null}

        {active === "trademarks" ? (
          <>
            <Text style={styles.body}>
              {t("settings.about_screen.trademarks.body")}
            </Text>
            {TRADEMARKS.map((row) => (
              <View key={row.name} style={styles.card}>
                <Text style={styles.tmName}>{row.name}</Text>
                <Text style={styles.tmNote}>{t(row.noteKey)}</Text>
              </View>
            ))}
          </>
        ) : null}
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
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  navBtn: { padding: 6 },
  navTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  tabRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  tabChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surfaceAlt,
  },
  tabChipActive: { backgroundColor: theme.colors.primary },
  tabText: { fontSize: 12.5, fontWeight: "700", color: theme.colors.textMuted },
  tabTextActive: { color: theme.colors.onPrimary },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12, alignItems: "stretch" },
  brand: {
    fontSize: 24,
    fontWeight: "900",
    color: theme.colors.text,
    letterSpacing: -0.5,
    marginTop: 6,
  },
  version: { fontSize: 13, color: theme.colors.textMuted },
  body: { fontSize: 13.5, lineHeight: 20, color: theme.colors.text },
  smallNote: { fontSize: 11.5, lineHeight: 17, color: theme.colors.textMuted },
  checkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.pill,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignSelf: "flex-start",
  },
  checkLabel: { fontSize: 13.5, fontWeight: "800", color: theme.colors.onPrimary },
  resultBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
  },
  resultBoxHighlight: { borderColor: theme.colors.primary },
  resultText: { flex: 1, fontSize: 13, lineHeight: 18, color: theme.colors.text },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 8,
  },
  noteHead: { fontSize: 13, fontWeight: "800", color: theme.colors.textMuted },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.primary,
    marginTop: 7,
  },
  bulletText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: theme.colors.text },
  tmName: { fontSize: 14.5, fontWeight: "800", color: theme.colors.text },
  tmNote: { fontSize: 13, lineHeight: 18, color: theme.colors.textMuted },
}));
