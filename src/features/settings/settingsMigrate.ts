// C:\OOTDify\src\features\settings\settingsMigrate.ts
// Versioned migration for the persisted settings (settingsStore.ts). Pure, so
// Jest can test it without AsyncStorage.
//
// v1: the app now opens in light mode by default. Installs from before v1
// saved "system" without anyone choosing it (it was the default), so it moves
// to "light"; an explicit "dark" or "light" is kept. After v1, "system" is a
// real choice and is left alone.
import type { AppearanceMode } from "./settingsStore";

export const SETTINGS_VERSION = 1;
export const DEFAULT_APPEARANCE: AppearanceMode = "light";

export function migrateSettings(persisted: unknown, version: number): Record<string, unknown> {
  const state = persisted && typeof persisted === "object" ? { ...(persisted as Record<string, unknown>) } : {};
  if (version < 1 && state.appearance === "system") state.appearance = "light";
  return state;
}
