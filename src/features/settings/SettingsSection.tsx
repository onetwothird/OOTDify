// C:\OOTDify\src\features\settings\SettingsSection.tsx
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import * as Application from "expo-application";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";

import {
  AppearanceMode,
  LanguageCode,
  useSettingsStore,
} from "./settingsStore";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { makeStyles } from "../../shared/theme/makeStyles";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import type { TranslationKey } from "../../shared/i18n/translate";

type IconName = keyof typeof Ionicons.glyphMap;

// Language labels remain in their native names (English is always English)
const LANGUAGE_OPTIONS: { code: LanguageCode; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fil", label: "Filipino" },
];

const APPEARANCE_OPTIONS: { mode: AppearanceMode; icon: IconName }[] = [
  { mode: "system", icon: "phone-portrait-outline" },
  { mode: "light", icon: "sunny-outline" },
  { mode: "dark", icon: "moon-outline" },
];

function appVersionLabel(t: any): string {
  const version = Application.nativeApplicationVersion;
  const build = Application.nativeBuildVersion;
  if (version && build) return t("settings.version.build", { version, build });
  if (version) return t("settings.version", { version });
  return t("settings.version.unknown");
}

export function SettingsSection() {
  const router = useRouter();
  const { t } = useT();
  const theme = useAppTheme();
  const styles = useStyles();

  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const appearance = useSettingsStore((s) => s.appearance);
  const setAppearance = useSettingsStore((s) => s.setAppearance);
  const biometricLock = useSettingsStore((s) => s.biometricLock);
  const setBiometricLock = useSettingsStore((s) => s.setBiometricLock);

  const [bioAvailable, setBioAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [hasHardware, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (alive) setBioAvailable(hasHardware && enrolled);
      } catch {
        if (alive) setBioAvailable(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggleBiometric = (next: boolean) => {
    if (next && bioAvailable === false) {
      Alert.alert(
        t("settings.biometric.alert.title"),
        t("settings.biometric.alert.message")
      );
      return;
    }
    if (!next) {
      setBiometricLock(false);
      return;
    }
    // Prove the sensor works before relying on it, so nobody locks themselves
    // out with a fingerprint the phone will not accept.
    void (async () => {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: t("settings.biometric.confirm_prompt"),
          cancelLabel: t("lock.cancel"),
          disableDeviceFallback: false,
        });
        if (result.success) setBiometricLock(true);
      } catch {
        Alert.alert(t("settings.biometric.alert.title"), t("lock.failed"));
      }
    })();
  };

  return (
    <View style={styles.root}>
      <SectionLabel text={t("settings.section.general")} />

      {/* General — language / appearance / biometric */}
      <View style={styles.card}>
        <Text style={styles.groupLabel}>{t("settings.language")}</Text>
        <View style={styles.pickerRow}>
          {LANGUAGE_OPTIONS.map((opt) => {
            const active = opt.code === language;
            return (
              <Pressable
                key={opt.code}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setLanguage(opt.code)}
                style={[styles.pill, active && styles.pillActive]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.cardDivider} />

        <Text style={styles.groupLabel}>{t("settings.appearance")}</Text>
        <View style={styles.pickerRow}>
          {APPEARANCE_OPTIONS.map((opt) => {
            const active = opt.mode === appearance;
            return (
              <Pressable
                key={opt.mode}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setAppearance(opt.mode)}
                style={[styles.pill, active && styles.pillActive]}
              >
                <Ionicons
                  name={opt.icon}
                  size={15}
                  color={active ? theme.colors.onPrimary : theme.colors.textMuted}
                />
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {t(`settings.appearance.${opt.mode}` as TranslationKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.switchRow}>
          <Ionicons name="finger-print-outline" size={20} color={theme.colors.brand} />
          <View style={styles.switchBody}>
            <Text style={styles.rowLabel}>{t("settings.biometric.title")}</Text>
            <Text style={styles.rowHint}>
              {bioAvailable === false
                ? t("settings.biometric.unavailable")
                : t("settings.biometric.hint")}
            </Text>
          </View>
          <Switch
            value={biometricLock}
            onValueChange={toggleBiometric}
            disabled={bioAvailable === false}
            trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
            thumbColor={theme.colors.surface}
          />
        </View>

      </View>

      {/* Help */}
      <SectionLabel text={t("notifications.title")} />
      <View style={styles.card}>
        <Row
          icon="notifications-outline"
          label={t("notifications.settings")}
          hint={t("notifications.settings.row_hint")}
          onPress={() => router.push("/settings/notifications")}
        />
      </View>

      <SectionLabel text={t("settings.section.help")} />
      <View style={styles.card}>
        <Row
          icon="help-circle-outline"
          label={t("settings.help.use")}
          onPress={() => router.push("/settings/help")}
        />
      </View>

      {/* Backup */}
      <SectionLabel text={t("settings.section.backup")} />
      <View style={styles.card}>
        <Row
          icon="save-outline"
          label={t("settings.backup.manage")}
          hint={t("settings.backup.hint")}
          onPress={() => router.push("/settings/backup")}
        />
      </View>

      {/* Updates & feedback — separate from About */}
      <SectionLabel text={t("settings.section.updates")} />
      <View style={styles.card}>
        <Row
          icon="cloud-download-outline"
          label={t("settings.about.updates")}
          onPress={() => router.push("/settings/about?tab=updates")}
        />
        <View style={styles.rowDivider} />
        <Row
          icon="sparkles-outline"
          label={t("settings.about.whatsnew")}
          onPress={() => router.push("/settings/about?tab=whatsnew")}
        />
        <View style={styles.rowDivider} />
        <Row
          icon="chatbox-ellipses-outline"
          label={t("settings.about.feedback")}
          onPress={() => router.push("/settings/about?tab=feedback")}
        />
      </View>

      {/* About */}
      <SectionLabel text={t("settings.section.about")} />
      <View style={styles.card}>
        <Row
          icon="information-circle-outline"
          label={t("settings.about.app")}
          hint={appVersionLabel(t)}
          onPress={() => router.push("/settings/about?tab=about")}
        />
        <View style={styles.rowDivider} />
        <Row
          icon="lock-closed-outline"
          label={t("settings.about.privacy")}
          onPress={() => router.push("/privacy/policy")}
        />
        <View style={styles.rowDivider} />
        <Row
          icon="ribbon-outline"
          label={t("settings.about.trademarks")}
          onPress={() => router.push("/settings/about?tab=trademarks")}
        />
      </View>
    </View>
  );
}

function SectionLabel({ text }: { text: string }) {
  const styles = useStyles();
  return (
    <Text style={styles.sectionLabelText} accessibilityRole="header">
      {text}
    </Text>
  );
}

function Row({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <Ionicons name={icon} size={20} color={theme.colors.brand} />
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  // Label-to-card gap is `root.gap`; card-to-next-label adds the label's top margin.
  root: { gap: 10 },
  sectionLabelText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textMuted,
    marginTop: 18,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 12,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
  },
  groupLabel: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  pickerRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surfaceAlt,
  },
  pillActive: { backgroundColor: theme.colors.primary },
  pillText: { fontSize: 13, fontWeight: "600", color: theme.colors.textMuted },
  pillTextActive: { color: theme.colors.onPrimary },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  switchBody: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  rowHint: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
  },
}));