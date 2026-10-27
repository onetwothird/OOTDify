// C:\OOTDify\src\features\settings\AccountSection.tsx
// Account part of the Settings screen: AI service status (real /health
// probe), Privacy & legal links, and sign out. Lives in Settings so Edit
// profile stays about the profile only.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { checkBackendHealth } from "../../services/aiApi";
import type { HealthResult } from "../../services/aiApi";
import { useT } from "../../shared/i18n/useT";
import { supabase } from "../../shared/lib/supabase";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import type { Theme } from "../../shared/config/theme";

export function AccountSection() {
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();

  const [health, setHealth] = useState<HealthResult | null>(null);
  const [checking, setChecking] = useState(true);
  // Core probe — effect-safe (no synchronous setState); state starts as checking.
  const probeHealth = useCallback(async () => {
    const result = await checkBackendHealth();
    setHealth(result);
    setChecking(false);
  }, []);

  // Handler-facing wrapper: show the spinner on manual re-checks.
  const checkHealth = useCallback(async () => {
    setChecking(true);
    await probeHealth();
  }, [probeHealth]);

  useEffect(() => {
    // Microtask kick-off: no setState runs synchronously within the effect body.
    Promise.resolve()
      .then(() => probeHealth())
      .catch(() => {});
  }, [probeHealth]);

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{t("profile.ai_service.label")}</Text>
      <View style={styles.card}>
        {checking ? (
          <View style={styles.serviceRow}>
            <ActivityIndicator size="small" color={theme.colors.brand} />
            <Text style={styles.serviceText}>{t("profile.ai_service.checking")}</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => void checkHealth()}
            style={styles.serviceRow}
          >
            <View style={[styles.serviceDot, health?.ok ? styles.serviceDotOk : styles.serviceDotWarn]} />
            <View style={styles.serviceBody}>
              <Text style={styles.serviceTitle}>
                {health?.ok ? t("profile.ai_service.connected") : t("profile.ai_service.unavailable")}
              </Text>
              <Text style={styles.serviceText}>
                {health?.ok
                  ? health.modelLoaded
                    ? t("profile.ai_service.ready")
                    : t("profile.ai_service.warming")
                  : (health?.message ?? t("profile.ai_service.hint"))}
              </Text>
            </View>
            {health?.ok ? (
              <Ionicons name="refresh" size={15} color={theme.colors.textMuted} />
            ) : (
              <Text style={styles.serviceRetry}>{t("profile.ai_service.retry")}</Text>
            )}
          </Pressable>
        )}
      </View>

      <Text style={styles.label}>{t("profile.privacy.label")}</Text>
      <View style={styles.card}>
        <LinkRow
          icon="shield-checkmark-outline"
          label={t("profile.privacy.data")}
          hint={t("profile.privacy.data.hint")}
          onPress={() => router.push("/privacy/data")}
        />
        <LinkRow
          icon="document-text-outline"
          label={t("profile.privacy.policy")}
          onPress={() => router.push("/privacy/policy")}
        />
        <LinkRow
          icon="receipt-outline"
          label={t("profile.privacy.terms")}
          onPress={() => router.push("/privacy/terms")}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}
        onPress={() => void supabase.auth.signOut()}
      >
        <Ionicons name="log-out-outline" size={18} color={theme.colors.danger} />
        <Text style={styles.signOutText}>{t("profile.sign_out")}</Text>
      </Pressable>
    </View>
  );
}

function LinkRow({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.85 }]}
    >
      <Ionicons name={icon} size={20} color={theme.colors.primary} />
      <View style={styles.linkBody}>
        <Text style={styles.linkLabel}>{label}</Text>
        {hint ? <Text style={styles.linkHint}>{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  group: { gap: 12, marginTop: 24 },
  label: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted, marginTop: 4 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 14,
  },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  linkBody: { flex: 1, minWidth: 0 },
  linkLabel: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  linkHint: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  serviceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  serviceDot: { width: 10, height: 10, borderRadius: 5 },
  serviceDotOk: { backgroundColor: theme.colors.success },
  serviceDotWarn: { backgroundColor: theme.colors.warning },
  serviceBody: { flex: 1, minWidth: 0 },
  serviceTitle: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  serviceText: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17, marginTop: 2 },
  serviceRetry: { fontSize: 12.5, fontWeight: "700", color: theme.colors.primary },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    paddingVertical: 14,
  },
  signOutText: { color: theme.colors.danger, fontWeight: "600", fontSize: 15 },
}));
