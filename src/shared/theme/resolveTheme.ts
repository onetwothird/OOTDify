// C:\OOTDify\src\shared\theme\resolveTheme.ts
// Pure theme resolution — no React, no React Native imports.
//
// This is the rule the whole appearance feature rests on, so it lives apart
// from the provider (which is a .tsx file that pulls in `react-native` and
// therefore cannot be imported by the node-environment unit tests):
//   * "light" / "dark" are absolute and ignore the device entirely;
//   * "system" follows the device, so an OS theme flip changes the app live.
//
// Anything other than a device-reported "dark" resolves to light, which is the
// safe default for a null/absent scheme (and for "unspecified", which the OS
// reports on some Android configurations).

import {
  darkTheme,
  lightTheme,
  type Theme,
} from "../config/theme";
import type { AppearanceMode } from "../../features/settings/settingsStore";

/** What is actually drawn: light or dark. Never "system". */
export type ResolvedScheme = "light" | "dark";

/** The device's reported appearance, matching React Native's `ColorSchemeName`. */
export type DeviceScheme = "light" | "dark" | "unspecified" | null | undefined;

export function resolveScheme(
  preference: AppearanceMode,
  systemScheme: DeviceScheme,
): ResolvedScheme {
  if (preference === "light" || preference === "dark") return preference;
  return systemScheme === "dark" ? "dark" : "light";
}

/** The full theme (palette + tokens) for a resolved scheme. */
export function themeForScheme(scheme: ResolvedScheme): Theme {
  return scheme === "dark" ? darkTheme : lightTheme;
}
