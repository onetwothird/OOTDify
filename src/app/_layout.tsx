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
//
// Public routes: the landing page's Terms of Service / Privacy Policy links
// open /privacy/terms and /privacy/policy for signed-out visitors, so those two
// documents are exempt from the signed-out redirect.
import { Session } from "@supabase/supabase-js";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BiometricGate } from "../features/settings/BiometricGate";
import { FlyingPreloader } from "../shared/components/FlyingPreloader";
import { PenggiMomentHost, penggi } from "../shared/components/PenggiMoment";
import { translateNow } from "../shared/i18n/useT";
import { nextWelcome } from "../shared/lib/welcome";
import { ToastHost } from "../shared/components/ToastHost";
import { TERMS_VERSION } from "../shared/config/legal";
import { lightColors } from "../shared/config/theme";
import { isAuthRedirectHeld } from "../shared/lib/authRedirectHold";
import { supabase } from "../shared/lib/supabase";
import { ThemeProvider, useThemeState } from "../shared/theme/ThemeProvider";

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

// Lets the first screen settle before Penggi celebrates.
const WELCOME_DELAY_MS = 700;
// Module scope so a remount of the root never celebrates twice in one launch.
let welcomedThisLaunch = false;

export default function RootLayout() {
  // ThemeProvider must be the outermost themed element so every screen below —
  // including the auth/splash chrome — reads the same resolved palette.
  return (
    <ThemeProvider>
      <RootLayoutInner />
    </ThemeProvider>
  );
}

function RootLayoutInner() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(!AUTH_CONFIGURED);

  const { theme: activeTheme, scheme, ready: themeReady } = useThemeState();

  // Text uses the platform system font (San Francisco on iOS, Roboto on
  // Android), so there are no font files to wait for at startup.

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
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      // Happy Penggi celebrates a sign-in, and once per launch when the app
      // opens already signed in (see nextWelcome).
      const next = nextWelcome(event, !!session, welcomedThisLaunch);
      welcomedThisLaunch = next.welcomed;
      if (next.show) {
        setTimeout(
          () => penggi.show("welcome", translateNow("penggi.welcome.title"), translateNow("penggi.welcome.message")),
          WELCOME_DELAY_MS,
        );
      }
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
    if (initialized && themeReady) SplashScreen.hideAsync().catch(() => {});
  }, [initialized, themeReady]);

  useEffect(() => {
    if (!initialized) return;
    // A screen is mid sign-in/sign-out (email sign-up); it navigates itself.
    if (isAuthRedirectHeld()) return;
    const inAuthGroup = segments[0] === "(auth)";
    // Terms and Privacy are public reading material: the landing page links to
    // them before anyone has an account. "privacy/data" is NOT public — it
    // reads the signed-in user's own data.
    const isLegalDoc =
      segments[0] === "privacy" &&
      (segments[1] === "terms" || segments[1] === "policy");
    const atConsentGate = segments[0] === "consent" || isLegalDoc;
    if (!session && !inAuthGroup && !isLegalDoc) {
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

  if (!initialized || !themeReady) {
    // Branded preloader for the window between native-splash hide and first
    // route render (never an unbranded white flash). Held until the saved
    // appearance preference has been read, so a Dark-mode user never sees a
    // light frame first.
    return (
      <View style={[styles.boot, { backgroundColor: activeTheme.colors.background }]}>
        <FlyingPreloader />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      {/* Follow the app's own Appearance setting, not just the OS one. */}
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: activeTheme.colors.background },
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
        {/* Always light (see LegalDocument), so no dark flash during the transition. */}
        <Stack.Screen name="privacy/policy" options={{ contentStyle: { backgroundColor: lightColors.background } }} />
        <Stack.Screen name="privacy/terms" options={{ contentStyle: { backgroundColor: lightColors.background } }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <PenggiMomentHost />
      <ToastHost />
      {/* Last, so the lock covers every screen and toast. */}
      <BiometricGate signedIn={Boolean(session)} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    // backgroundColor is applied inline from the active theme (see the boot
    // preloader) so dark mode does not flash a light page.
  },
});
