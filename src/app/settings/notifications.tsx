// C:\OOTDify\src\app\settings\notifications.tsx
// Notification settings: whether this phone gets push at all, a switch for
// each kind, and quiet hours. Every switch is saved to the server straight
// away, because the database decides what to send. Do not disturb (your
// status on the Friends tab) also holds back push.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { communityErrorMessage } from "../../features/community/service";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  fetchNotificationSettings,
  registerForPush,
  saveNotificationSettings,
  type NotificationSettings,
  type PushSetup,
} from "../../features/notifications/service";
import { nativePush } from "../../features/notifications/nativePush";
import { useT } from "../../shared/i18n/useT";
import type { TranslationKey } from "../../shared/i18n/translate";
import { toast } from "../../shared/lib/toast";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";

type Kind = "messages" | "group_chats" | "friends" | "posts" | "my_day" | "communities";

const KINDS: { key: Kind; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "messages", icon: "chatbubble-outline" },
  { key: "group_chats", icon: "chatbubbles-outline" },
  { key: "friends", icon: "person-add-outline" },
  { key: "posts", icon: "heart-outline" },
  { key: "my_day", icon: "sunny-outline" },
  { key: "communities", icon: "people-outline" },
];

/** Quiet-hours presets, as [start, end) local hours; null is off. */
const QUIET: { key: string; range: [number, number] | null }[] = [
  { key: "off", range: null },
  { key: "night", range: [22, 7] },
  { key: "late", range: [23, 8] },
  { key: "school", range: [8, 15] },
];

export default function NotificationSettingsScreen() {
  const styles = useStyles();
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useT();

  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [push, setPush] = useState<PushSetup | "checking">("checking");

  useEffect(() => {
    let alive = true;
    void fetchNotificationSettings()
      .then((s) => alive && setSettings(s))
      .catch(() => alive && setSettings(DEFAULT_NOTIFICATION_SETTINGS));
    void registerForPush()
      .then((p) => alive && setPush(p))
      .catch(() => alive && setPush("no-project"));
    return () => {
      alive = false;
    };
  }, []);

  const save = (patch: Partial<NotificationSettings>) => {
    if (!settings) return;
    const before = settings;
    setSettings({ ...settings, ...patch });
    void saveNotificationSettings(patch).catch((e) => {
      setSettings(before);
      toast.error(t("notifications.toast.error"), communityErrorMessage(e));
    });
  };

  const quietKey =
    QUIET.find((q) =>
      q.range === null
        ? settings?.quiet_start == null
        : q.range[0] === settings?.quiet_start && q.range[1] === settings?.quiet_end,
    )?.key ?? "off";

  const enablePush = async () => {
    const current = await nativePush()?.getPermissionsAsync();
    if (current && !current.canAskAgain) {
      void Linking.openSettings();
      return;
    }
    setPush(await registerForPush().catch(() => "no-project" as const));
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.navRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("settings.screen.back_a11y")}
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.navBtn}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.navTitle}>{t("notifications.settings")}</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        {/* Phone push status */}
        <View style={[styles.pushCard, push === "ready" ? styles.pushReady : styles.pushOff]}>
          <Ionicons
            name={push === "ready" ? "notifications" : "notifications-off-outline"}
            size={22}
            color={push === "ready" ? theme.colors.success : theme.colors.warning}
          />
          <View style={styles.flex}>
            <Text style={styles.rowLabel}>
              {push === "checking" ? t("notifications.push.checking") : t(`notifications.push.${push}` as TranslationKey)}
            </Text>
            {push !== "ready" && push !== "checking" ? (
              <Text style={styles.rowHint}>{t(`notifications.push.${push}.hint` as TranslationKey)}</Text>
            ) : null}
          </View>
          {push === "checking" ? <ActivityIndicator size="small" color={theme.colors.brand} /> : null}
          {push === "denied" ? (
            <Pressable accessibilityRole="button" onPress={() => void enablePush()} style={styles.pushBtn}>
              <Text style={styles.pushBtnText}>{t("notifications.push.enable")}</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.label}>{t("notifications.settings.kinds")}</Text>
        <View style={styles.card}>
          {settings === null ? (
            <ActivityIndicator color={theme.colors.brand} style={styles.loading} />
          ) : (
            KINDS.map((k, i) => (
              <View key={k.key}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.switchRow}>
                  <Ionicons name={k.icon} size={20} color={theme.colors.brand} />
                  <View style={styles.flex}>
                    <Text style={styles.rowLabel}>{t(`notifications.kind.${k.key}` as TranslationKey)}</Text>
                    <Text style={styles.rowHint}>{t(`notifications.kind.${k.key}.hint` as TranslationKey)}</Text>
                  </View>
                  <Switch
                    value={settings[k.key]}
                    // Group chats only matter while messages are on.
                    disabled={k.key === "group_chats" && !settings.messages}
                    onValueChange={(v) => save({ [k.key]: v })}
                    trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
                    thumbColor={theme.colors.surface}
                  />
                </View>
              </View>
            ))
          )}
        </View>

        <Text style={styles.label}>{t("notifications.quiet.title")}</Text>
        <Text style={styles.sub}>{t("notifications.quiet.hint")}</Text>
        <View style={styles.quietGrid}>
          {QUIET.map((q) => {
            const active = q.key === quietKey;
            return (
              <Pressable
                key={q.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                disabled={!settings}
                onPress={() => save({ quiet_start: q.range?.[0] ?? null, quiet_end: q.range?.[1] ?? null })}
                style={({ pressed }) => [styles.quiet, active && styles.quietActive, pressed && { opacity: 0.85 }]}
              >
                <Ionicons
                  name={q.range ? "moon-outline" : "volume-high-outline"}
                  size={18}
                  color={active ? theme.colors.onPrimary : theme.colors.textMuted}
                />
                <Text style={[styles.quietText, active && styles.quietTextActive]}>
                  {t(`notifications.quiet.${q.key}` as TranslationKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.note}>
          <Ionicons name="remove-circle-outline" size={18} color={theme.colors.danger} />
          <Text style={styles.noteText}>{t("notifications.dnd_note")}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
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
  content: { padding: 16 },
  flex: { flex: 1, minWidth: 0 },
  pushCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
  },
  pushReady: { borderColor: theme.colors.success, backgroundColor: theme.colors.surface },
  pushOff: { borderColor: theme.colors.warning, backgroundColor: theme.colors.surface },
  pushBtn: {
    paddingHorizontal: 14,
    minHeight: 34,
    justifyContent: "center",
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.brand,
  },
  pushBtnText: { fontSize: 13, fontWeight: "600", color: theme.colors.onBrand },
  label: { fontSize: 15, fontWeight: "700", color: theme.colors.text, marginTop: 22, marginBottom: 8 },
  sub: { fontSize: 13, color: theme.colors.textMuted, marginTop: -4, marginBottom: 10 },
  card: {
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
  },
  loading: { paddingVertical: 24 },
  divider: { height: 1, backgroundColor: theme.colors.border },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowLabel: { fontSize: 15, fontWeight: "600", color: theme.colors.text },
  rowHint: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 2, lineHeight: 17 },
  quietGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quiet: {
    flexGrow: 1,
    flexBasis: "45%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  quietActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.brand },
  quietText: { flexShrink: 1, fontSize: 13.5, fontWeight: "600", color: theme.colors.text },
  quietTextActive: { color: theme.colors.onPrimary },
  note: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    padding: 14,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  noteText: { flex: 1, fontSize: 13, lineHeight: 18, color: theme.colors.textMuted },
}));
