// C:\OOTDify\src\app\_layout.tsx
// Root layout: auth gating + consent gating + SafeAreaProvider + stack routes.
//
// Preload/splash: the native splash stays up (preventAutoHideAsync at module
// load) until the auth session has resolved, then hides — BootSplash (the
// same background and Penggi) covers the gap on platforms where the native splash
// already retired, so a cold start never flashes white. Loading resolves on success AND failure.
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
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { clearProfileCache } from "../features/profile/profileCache";
import { BiometricGate } from "../features/settings/BiometricGate";
import { BootSplash } from "../shared/components/BootSplash";
import { PenggiMomentHost, penggi } from "../shared/components/PenggiMoment";
import { translateNow } from "../shared/i18n/useT";
import { nextWelcome } from "../shared/lib/welcome";
import { ToastHost } from "../shared/components/ToastHost";
import { TERMS_VERSION } from "../shared/config/legal";
import { lightColors } from "../shared/config/theme";
import { isAuthRedirectHeld } from "../shared/lib/authRedirectHold";
import { authRedirect } from "../shared/lib/authRoute";
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

// Short, so the white welcome screen covers the hop from sign-in to Home
// instead of popping up after Home has already shown.
const WELCOME_DELAY_MS = 150;
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
      // The cached profile page belongs to the account that just left.
      if (event === "SIGNED_OUT") clearProfileCache();
      // Happy Penggi celebrates a sign-in, and once per launch when the app
      // opens already signed in (see nextWelcome). Not while a screen holds
      // the redirects: sign-up's momentary session is not a sign-in, and
      // sign-up shows its own celebration.
      if (isAuthRedirectHeld()) return;
      const next = nextWelcome(event, !!session, welcomedThisLaunch);
      welcomedThisLaunch = next.welcomed;
      if (next.show) {
        // Held from now, so Home's permission prompts can't slip in first.
        penggi.expect();
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
    // Consent is checked on the way out of the auth screens too, so email
    // sign-up (which records the version at signUp) skips the gate while
    // Google sign-ups take it.
    const next = authRedirect(segments, Boolean(session), hasCurrentConsent(session));
    if (!next) return;
    if (next.replace) router.replace(next.to);
    else router.push(next.to);
  }, [session, initialized, segments, router]);

  if (!initialized || !themeReady) {
    // The window between native-splash hide and first route render: the
    // same screen and Penggi as the native splash (white, or dark in dark
    // mode), so launch reads as one screen. Held until the saved appearance
    // preference has been read.
    return (
      <>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <BootSplash dark={scheme === "dark"} />
      </>
    );
  }

  return (
    <SafeAreaProvider>
      {/* Tracks the keyboard everywhere, including inside Modals on Android. */}
      <KeyboardProvider>
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
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

