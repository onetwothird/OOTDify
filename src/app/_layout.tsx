// C:\OOTDify\src\app\_layout.tsx
// Root layout: auth gating + consent gating + SafeAreaProvider + stack routes.
//
// Preload/splash: the native splash stays up (preventAutoHideAsync at module
// load) until the auth session has resolved, then hides — a branded preloader
// covers the gap on platforms where the native splash already retired, so a
// cold start never flashes white. Loading resolves on success AND failure.
//
// Consent gate (Phase 7): a signed-in session whose auth metadata doesn't
// record the current terms version is routed to /consent (which allows reading
// the documents in /privacy/* while deciding). The backend independently
// rejects AI processing without that record (403 consent_required) — this gate
// just makes the requirement visible instead of surfacing it as a random error.
import { Session } from "@supabase/supabase-js";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TERMS_VERSION } from "../shared/config/legal";
import { theme } from "../shared/config/theme";
import { supabase } from "../shared/lib/supabase";

// Keep the native splash visible while the session resolves (both outcomes of
// the loader below call hideAsync, so this can never strand the splash).
SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden or unsupported — non-fatal */
});

// Auth availability is fixed at module load (env doesn't change at runtime),
// so the "initialized" default can be computed during render instead of via a
// synchronous setState inside an effect.
const AUTH_CONFIGURED = Boolean(
  supabase && supabase.auth && typeof supabase.auth.getSession === "function",
);

/** True when the account has recorded acceptance of the current terms version. */
function hasCurrentConsent(session: Session | null): boolean {
  const metadata = session?.user?.user_metadata;
  if (!metadata) return false;
  const version = (metadata as { terms_version?: unknown }).terms_version;
  return typeof version === "string" && version === TERMS_VERSION;
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(!AUTH_CONFIGURED);

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    if (!AUTH_CONFIGURED) return;

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        setSession(session);
        setInitialized(true);
      })
      .catch(() => {
        if (mounted) setInitialized(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      mounted = false;
      try {
        subscription.unsubscribe();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Hide the native splash only after the first real frame can render.
  useEffect(() => {
    if (initialized) SplashScreen.hideAsync().catch(() => {});
  }, [initialized]);

  useEffect(() => {
    if (!initialized) return;
    const inAuthGroup = segments[0] === "(auth)";
    const atConsentGate = segments[0] === "consent" || segments[0] === "privacy";
    if (!session && !inAuthGroup) {
      router.push("/(auth)");
    } else if (session && inAuthGroup) {
      // Consent check also runs here so email sign-up (which records the
      // version at signUp) skips the gate while Google sign-ups take it.
      if (hasCurrentConsent(session)) router.replace("/(tabs)/home");
      else router.replace("/consent");
    } else if (session && !hasCurrentConsent(session) && !atConsentGate) {
      router.replace("/consent");
    }
  }, [session, initialized, segments, router]);

  if (!initialized) {
    // Branded preloader for the window between native-splash hide and first
    // route render (never an unbranded white flash).
    return (
      <View style={styles.boot}>
        <Image
          source={require("../../assets/images/ootdify-icon.png")}
          style={styles.bootLogo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <ActivityIndicator color={theme.colors.textMuted} style={styles.bootSpinner} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="ai-picker" />
        <Stack.Screen name="catalog/[id]" />
        <Stack.Screen name="item/[id]" />
        <Stack.Screen name="outfit/[id]" />
        <Stack.Screen name="consent" />
        <Stack.Screen name="privacy/data" />
        <Stack.Screen name="privacy/policy" />
        <Stack.Screen name="privacy/terms" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  bootLogo: { width: 96, height: 96 },
  bootSpinner: { marginTop: theme.spacing.md },
});
