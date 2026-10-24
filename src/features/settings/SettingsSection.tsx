// C:\OOTDify\src\features\settings\SettingsSection.tsx
// The settings content rendered INSIDE Profile (Profile is the settings hub).
// Device preferences (language, appearance, biometric unlock) are applied live
// through the settings store; Help / Backup / About push to their own screens.
// Nothing here is account data — these are per-device preferences stored
// locally in AsyncStorage.
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
import { theme } from "../../shared/config/theme";

type IconName = keyof typeof Ionicons.glyphMap;

const LANGUAGE_OPTIONS: { code: LanguageCode; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fil", label: "Filipino" },
];

const APPEARANCE_OPTIONS: { mode: AppearanceMode; label: string; icon: IconName }[] = [
  { mode: "system", label: "System", icon: "phone-portrait-outline" },
  { mode: "light", label: "Light", icon: "sunny-outline" },
  { mode: "dark", label: "Dark", icon: "moon-outline" },
];

/** Real app version from the native package (never hardcoded). */
function appVersionLabel(): string {
  const version = Application.nativeApplicationVersion;
  const build = Application.nativeBuildVersion;
  if (version && build) return `Version ${version} (${build})`;
  if (version) return `Version ${version}`;
  return "Version unknown";
}

export function SettingsSection() {
  const router = useRouter();

  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const appearance = useSettingsStore((s) => s.appearance);
  const setAppearance = useSettingsStore((s) => s.setAppearance);
  const biometricLock = useSettingsStore((s) => s.biometricLock);
  const setBiometricLock = useSettingsStore((s) => s.setBiometricLock);

  // Whether the device can actually do biometric (or secure) unlock. Resolved
  // once; if the hardware is missing the toggle is disabled rather than lying.
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
        "Not available",
        "This device has no enrolled face or fingerprint. Add one in system settings first.",
      );
      return;
    }
    setBiometricLock(next);
  };

  return (
    <>
      <SectionLabel text="SETTINGS" />

      {/* General — language / appearance / biometric */}
      <View style={styles.card}>
        <Text style={styles.groupLabel}>Language</Text>
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

        <Text style={styles.groupLabel}>Appearance</Text>
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
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.switchRow}>
          <Ionicons name="finger-print-outline" size={20} color={theme.colors.primary} />
          <View style={styles.switchBody}>
            <Text style={styles.rowLabel}>Biometric unlock</Text>
            <Text style={styles.rowHint}>
              {bioAvailable === false
                ? "Not available on this device"
                : "Ask for face or fingerprint when you return to the app"}
            </Text>
          </View>
          <Switch
            value={biometricLock}
            onValueChange={toggleBiometric}
            disabled={bioAvailable === false}
            trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
            thumbColor={theme.colors.surface}
          />
        </View>
      </View>

      {/* Help */}
      <SectionLabel text="HELP" />
      <View style={styles.card}>
        <Row
          icon="help-circle-outline"
          label="How to use OOTDify"
          onPress={() => router.push("/settings/help")}
        />
      </View>

      {/* Backup */}
      <SectionLabel text="BACKUP" />
      <View style={styles.card}>
        <Row
          icon="save-outline"
          label="Manage local backup"
          hint="Export or restore your app data on this device"
          onPress={() => router.push("/settings/backup")}
        />
      </View>

      {/* About */}
      <SectionLabel text="ABOUT" />
      <View style={styles.card}>
        <Row
          icon="cloud-download-outline"
          label="Check for updates"
          onPress={() => router.push("/settings/about?tab=updates")}
        />
        <View style={styles.rowDivider} />
        <Row
          icon="sparkles-outline"
          label="What's new"
          onPress={() => router.push("/settings/about?tab=whatsnew")}
        />
        <View style={styles.rowDivider} />
        <Row
          icon="chatbox-ellipses-outline"
          label="Send feedback"
          onPress={() => router.push("/settings/about?tab=feedback")}
        />
        <View style={styles.rowDivider} />
        <Row
          icon="lock-closed-outline"
          label="Privacy notice"
          onPress={() => router.push("/privacy/policy")}
        />
        <View style={styles.rowDivider} />
        <Row
          icon="ribbon-outline"
          label="Third-party trademarks"
          onPress={() => router.push("/settings/about?tab=trademarks")}
        />
      </View>

      <Text style={styles.version}>{appVersionLabel()}</Text>
    </>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionBar} />
      <Text style={styles.sectionLabelText}>{text}</Text>
    </View>
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
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <Ionicons name={icon} size={20} color={theme.colors.primary} />
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  sectionBar: {
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
  sectionLabelText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
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
  groupLabel: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
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
  pillText: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted },
  pillTextActive: { color: theme.colors.onPrimary },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  switchBody: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  rowHint: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
  },
  version: {
    fontSize: 11,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: 8,
  },
});
