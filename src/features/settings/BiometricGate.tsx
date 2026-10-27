// C:\OOTDify\src\features\settings\BiometricGate.tsx
// The biometric lock. When "Biometric unlock" is on, a signed-in user sees
// this full-screen cover at launch and whenever they return after more than
// LOCK_GRACE_MS in the background, and must pass the phone's fingerprint /
// face check (or its PIN, as the OS fallback) before the app shows again.
// Rendered last in the root layout, so it covers every route and the toasts.
//
// Signing out is always offered: if the phone's biometrics stop working, the
// way back in is the account password, which is no weaker than the lock.
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "../../shared/components/AppButton";
import { useT } from "../../shared/i18n/useT";
import { supabase } from "../../shared/lib/supabase";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { shouldLockOnReturn } from "./lockPolicy";
import { useSettingsStore } from "./settingsStore";

export function BiometricGate({ signedIn }: { signedIn: boolean }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const enabled = useSettingsStore((s) => s.biometricLock);
  const hydrated = useSettingsStore((s) => s.hydrated);

  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock once at launch, as soon as the saved setting is known (render-phase
  // adjust, so no setState runs synchronously inside an effect).
  const [launchChecked, setLaunchChecked] = useState(false);
  if (!launchChecked && hydrated) {
    setLaunchChecked(true);
    if (enabled && signedIn) setLocked(true);
  }
  // Signing out drops the lock; the login screen is the gate then.
  if (locked && !signedIn) setLocked(false);

  // Read inside the AppState handler only, never during render.
  const signedInRef = useRef(signedIn);
  const backgroundedAt = useRef<number | null>(null);
  useEffect(() => {
    signedInRef.current = signedIn;
  }, [signedIn]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        backgroundedAt.current = Date.now();
      } else if (next === "active") {
        const lock = shouldLockOnReturn({
          enabled: useSettingsStore.getState().biometricLock && signedInRef.current,
          backgroundedAt: backgroundedAt.current,
          now: Date.now(),
        });
        backgroundedAt.current = null;
        if (lock) setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  const unlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t("lock.prompt"),
        cancelLabel: t("lock.cancel"),
        // Let the phone fall back to its PIN / passcode after failed attempts.
        disableDeviceFallback: false,
      });
      if (result.success) {
        setLocked(false);
      } else if (result.error !== "user_cancel" && result.error !== "system_cancel" && result.error !== "app_cancel") {
        setError(t("lock.failed"));
      }
    } catch {
      setError(t("lock.failed"));
    } finally {
      setBusy(false);
    }
  }, [t]);

  // Ask straight away whenever the lock appears, one tick later so the cover
  // is drawn before the system's fingerprint / face sheet slides up.
  useEffect(() => {
    if (!locked) return;
    const id = setTimeout(() => void unlock(), 0);
    return () => clearTimeout(id);
  }, [locked, unlock]);

  if (!locked) return null;

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.cover, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      accessibilityViewIsModal
    >
      <View style={styles.middle}>
        <Image
          source={require("../../../assets/images/ootdify-icon.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={16} color={theme.colors.onPrimary} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {t("lock.title")}
        </Text>
        <Text style={styles.message}>{t("lock.message")}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.actions}>
        <AppButton
          label={t("lock.unlock")}
          icon="finger-print"
          onPress={() => void unlock()}
          loading={busy}
          disabled={busy}
        />
        <AppButton
          label={t("lock.sign_out")}
          variant="ghost"
          onPress={() => void supabase.auth.signOut()}
          disabled={busy}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  cover: {
    zIndex: 10000,
    elevation: 10000,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.lg,
    justifyContent: "space-between",
  },
  middle: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  logo: { width: 84, height: 84 },
  lockBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginTop: -22,
    marginLeft: 60,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    borderWidth: 3,
    borderColor: theme.colors.background,
  },
  title: { ...theme.typography.heading, color: theme.colors.text, marginTop: 8 },
  message: { ...theme.typography.body, color: theme.colors.textMuted, textAlign: "center", maxWidth: 300 },
  error: { fontSize: 13, color: theme.colors.danger, textAlign: "center" },
  actions: { gap: 4 },
}));
