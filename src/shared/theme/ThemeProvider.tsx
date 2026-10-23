// C:\OOTDify\src\shared\theme\ThemeProvider.tsx
// The single source of truth for the app's active palette.
//
// Two distinct ideas, deliberately kept apart:
//   * PREFERENCE — what the user chose in Settings: "light" | "dark" | "system".
//     Persisted in AsyncStorage (see features/settings/settingsStore.ts).
//   * RESOLVED THEME — what is actually drawn right now: "light" | "dark".
//     For "system" this follows the device and changes live when the OS flips.
//
// Screens read the resolved palette with `useAppTheme()` and build their styles
// from it. Because a theme change re-renders subscribers, every screen updates
// immediately — no restart, no reload.
//
// Startup: the store is rehydrated from AsyncStorage before the app tree is
// allowed to paint (`ThemeProvider` holds a null render until `hydrated`), so a
// user who chose Dark never sees a light flash on launch.
import { ReactNode, createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";

import { useSettingsStore, type AppearanceMode } from "../../features/settings/settingsStore";
import { type Theme, lightTheme } from "../config/theme";
import {
  resolveScheme,
  themeForScheme,
  type ResolvedScheme,
} from "./resolveTheme";

export type { ResolvedScheme } from "./resolveTheme";
export { resolveScheme, themeForScheme } from "./resolveTheme";

interface ThemeContextValue {
  /** The palette to draw with. */
  theme: Theme;
  /** "light" | "dark" — what is actually on screen. */
  scheme: ResolvedScheme;
  /** What the user picked: "light" | "dark" | "system". */
  preference: AppearanceMode;
  /** True once the saved preference has been read from disk. */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The device's current appearance. `useColorScheme` re-renders on OS change,
  // which is what makes "System" track a device theme switch live.
  const systemScheme = useColorScheme();
  const preference = useSettingsStore((s) => s.appearance);
  const hydrated = useSettingsStore((s) => s.hydrated);

  const value = useMemo<ThemeContextValue>(() => {
    const resolved = resolveScheme(preference, systemScheme);
    return {
      theme: themeForScheme(resolved),
      scheme: resolved,
      preference,
      ready: hydrated,
    };
  }, [preference, systemScheme, hydrated]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * The active palette. Every themed component calls this instead of importing
 * the static `theme`, so it re-renders when the palette changes.
 */
export function useAppTheme(): Theme {
  const ctx = useContext(ThemeContext);
  // Fall back to the light theme outside a provider rather than throwing: some
  // units (tests, the odd detached root) render components without one, and a
  // hard crash there is worse than a correctly-coloured default.
  return ctx?.theme ?? lightTheme;
}

/** Preference + resolved scheme, for the Settings selector and status bar. */
export function useThemeState(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  return (
    ctx ?? {
      theme: lightTheme,
      scheme: "light",
      preference: "system",
      ready: true,
    }
  );
}
