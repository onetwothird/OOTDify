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
import { shouldLockOnReturn } from "./lockPolicy";
import { useSettingsStore } from "./settingsStore";

const LOGO = 200;
const LOCK = 46;
const LOCK_ICON = 34;
// Blue lock with a white outline, so it stands out on the mascot's dark wing.
// Fixed in light and dark mode, like the mascot's own art, instead of following
// the theme.
const LOCK_FILL = "#2F5BB7";
const LOCK_OUTLINE = "#FFFFFF";
// Ionicons has no outlined-glyph option: stacking the outline colour at these
// offsets under the white glyph gives it a 2px border.
const OUTLINE_OFFSETS: [number, number][] = [
  [-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2],
];

export function BiometricGate({ signedIn }: { signedIn: boolean }) {
  const styles = useStyles();
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
        <View style={styles.logoWrap}>
          <Image
            source={require("../../../assets/images/mascot-penggi.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <View style={styles.lockInHand}>
            {OUTLINE_OFFSETS.map(([dx, dy]) => (
              <View key={`${dx},${dy}`} style={[styles.lockLayer, { transform: [{ translateX: dx }, { translateY: dy }] }]}>
                <Ionicons name="lock-closed" size={LOCK_ICON} color={LOCK_OUTLINE} />
              </View>
            ))}
            <View style={styles.lockLayer}>
              <Ionicons name="lock-closed" size={LOCK_ICON} color={LOCK_FILL} />
            </View>
          </View>
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
  logoWrap: { width: LOGO, height: LOGO, marginBottom: 6 },
  logo: { width: LOGO, height: LOGO },
  // Held in the mascot's raised wing. The PNG has a margin, so the spot is a
  // fraction of the artwork box (wing tip about 82% across, 41% down).
  lockInHand: {
    position: "absolute",
    left: LOGO * 0.82 - LOCK / 2,
    top: LOGO * 0.4 - LOCK / 2,
    width: LOCK,
    height: LOCK,
    alignItems: "center",
    justifyContent: "center",
  },
  lockLayer: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  title: { ...theme.typography.heading, color: theme.colors.text, marginTop: 8, textAlign: "center" },
  message: { ...theme.typography.body, color: theme.colors.textMuted, textAlign: "center", maxWidth: 300 },
  error: { fontSize: 13, color: theme.colors.danger, textAlign: "center" },
  actions: { gap: 4 },
}));
