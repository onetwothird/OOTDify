// C:\OOTDify\src\app\_layout.tsx
// Root layout: auth gating + SafeAreaProvider + stack routes.
import { Session } from "@supabase/supabase-js";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { theme } from "../shared/config/theme";
import { supabase } from "../shared/lib/supabase";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    if (!supabase || !supabase.auth || typeof supabase.auth.getSession !== "function") {
      setInitialized(true);
      return;
    }

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

  useEffect(() => {
    if (!initialized) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) {
      router.push("/(auth)");
    } else if (session && inAuthGroup) {
      router.replace("/(tabs)/home");
    }
  }, [session, initialized, segments]);

  if (!initialized) return null;

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
        <Stack.Screen name="catalog/[id]" />
        <Stack.Screen name="outfit/[id]" />
        <Stack.Screen name="privacy/data" />
        <Stack.Screen name="privacy/policy" />
        <Stack.Screen name="privacy/terms" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </SafeAreaProvider>
  );
}