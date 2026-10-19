// C:\OOTDify\src\app\settings\index.tsx
// Settings — device preferences and app info. Sections:
//   General  → Language, Appearance, Biometric unlock
//   Help     → How to use OOTDify
//   Backup   → Manage local backup
//   About    → Check for updates, What's new, Send feedback, Privacy notice,
//              Third-party trademarks
//
// Language and appearance are applied live through the settings store; biometric
// unlock arms an AppLock overlay (see features/settings/AppLock.tsx). Nothing
// here is account data — these are per-device preferences stored locally.
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AppearanceMode,
  LanguageCode,
  useSettingsStore,
} from "../../features/settings/settingsStore";
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

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
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
        <Text style={styles.navTitle}>Settings</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ------------------------------------------------ General */}
        <Text style={styles.sectionLabel}>GENERAL</Text>
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
        </View>

        <View style={styles.card}>
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
        </View>

        <View style={styles.card}>
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

        {/* ------------------------------------------------ Help */}
        <Text style={styles.sectionLabel}>HELP</Text>
        <View style={styles.card}>
          <Row
            icon="help-circle-outline"
            label="How to use OOTDify"
            onPress={() => router.push("/settings/help")}
          />
        </View>

        {/* ------------------------------------------------ Backup */}
        <Text style={styles.sectionLabel}>BACKUP</Text>
        <View style={styles.card}>
          <Row
            icon="save-outline"
            label="Manage local backup"
            hint="Export or restore your app data on this device"
            onPress={() => router.push("/settings/backup")}
          />
        </View>

        {/* ------------------------------------------------ About */}
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.card}>
          <Row
            icon="cloud-download-outline"
            label="Check for updates"
            onPress={() => router.push("/settings/about?tab=updates")}
          />
          <Divider />
          <Row
            icon="sparkles-outline"
            label="What's new"
            onPress={() => router.push("/settings/about?tab=whatsnew")}
          />
          <Divider />
          <Row
            icon="chatbox-ellipses-outline"
            label="Send feedback"
            onPress={() => router.push("/settings/about?tab=feedback")}
          />
          <Divider />
          <Row
            icon="lock-closed-outline"
            label="Privacy notice"
            onPress={() => router.push("/privacy/policy")}
          />
          <Divider />
          <Row
            icon="ribbon-outline"
            label="Third-party trademarks"
            onPress={() => router.push("/settings/about?tab=trademarks")}
          />
        </View>

        <Text style={styles.version}>OOTDify · Version 1.0.0</Text>
      </ScrollView>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
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
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginTop: 10,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 12,
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
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
  },
  version: {
    fontSize: 11,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: 16,
  },
});
