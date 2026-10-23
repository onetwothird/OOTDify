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
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  checkForStoreUpdate,
  UpdateCheckResult,
} from "../../features/settings/updates";
import { theme } from "../../shared/config/theme";
import { toast } from "../../shared/lib/toast";


type TabKey = "updates" | "whatsnew" | "feedback" | "trademarks";

const TABS: { key: TabKey; label: string }[] = [
  { key: "updates", label: "Updates" },
  { key: "whatsnew", label: "What's new" },
  { key: "feedback", label: "Feedback" },
  { key: "trademarks", label: "Trademarks" },
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

const RELEASE_NOTES: { version: string; date: string; items: string[] }[] = [
  {
    version: "This build",
    date: "Current",
    items: [
      "Community — see other members' shared outfits, react, comment, and message them 1:1.",
      "Open Community Chat — a shared room everyone in OOTDify can join.",
      "Profile is now the settings hub: language, appearance, biometric unlock, backup, and this About screen.",
      "Home redesign with Discover / Wardrobe / Looks segments, and a grid view for saved looks.",
    ],
  },
];

const TRADEMARKS: { name: string; note: string }[] = [
  { name: "Expo", note: "Build and runtime tooling this app is built with." },
  { name: "React Native", note: "The UI framework powering every screen." },
  { name: "Supabase", note: "Database, auth, storage, and realtime used by the app." },
  { name: "Ionicons", note: "The icon set shown throughout the interface." },
  { name: "Inter", note: "The typeface used across the app." },
];

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const requested = typeof params.tab === "string" ? params.tab : "";
  const active: TabKey = TABS.some((t) => t.key === requested)
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
        "No mail app available",
        "This device can't open a mail composer, so feedback couldn't be started.",
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
        <Text style={styles.navTitle}>About</Text>
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
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.brand}>OOTDify</Text>

        {active === "updates" ? (
          <>
            <Text style={styles.version}>Version {versionLabel()}</Text>
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
              <Text style={styles.checkLabel}>Check for updates</Text>
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
              Updates are delivered by the store you installed from — this app
              checks the published listing, it doesn&apos;t install over itself.
            </Text>
          </>
        ) : null}

        {active === "whatsnew" ? (
          <>
            {RELEASE_NOTES.map((note) => (
              <View key={note.version} style={styles.card}>
                <Text style={styles.noteHead}>
                  {note.version} · {note.date}
                </Text>
                {note.items.map((item) => (
                  <View key={item} style={styles.bulletRow}>
                    <View style={styles.bullet} />
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}
              </View>
            ))}
            <Text style={styles.smallNote}>
              Release notes describe only shipped features in this build.
            </Text>
          </>
        ) : null}

        {active === "feedback" ? (
          <>
            <Text style={styles.body}>
              Tell us what worked, what didn&apos;t, or what you&apos;d build next. The
              composer opens pre-filled with your app version and device so we
              can reproduce what you saw.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void sendFeedback()}
              style={({ pressed }) => [styles.checkBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="chatbox-ellipses-outline" size={17} color={theme.colors.onPrimary} />
              <Text style={styles.checkLabel}>Open feedback email</Text>
            </Pressable>
            <Text style={styles.smallNote}>
              {supportEmail()
                ? `Feedback goes to ${supportEmail()}.`
                : "No support address is configured yet, so the composer opens blank — add expo.extra.supportEmail in app.json to set the recipient."}
            </Text>
          </>
        ) : null}

        {active === "trademarks" ? (
          <>
            <Text style={styles.body}>
              OOTDify uses these third-party products. All trademarks belong to
              their respective owners; this app is not endorsed by them.
            </Text>
            {TRADEMARKS.map((row) => (
              <View key={row.name} style={styles.card}>
                <Text style={styles.tmName}>{row.name}</Text>
                <Text style={styles.tmNote}>{row.note}</Text>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  resultBoxHighlight: { borderColor: theme.colors.primary },
  resultText: { flex: 1, fontSize: 13, lineHeight: 18, color: theme.colors.text },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
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
});
