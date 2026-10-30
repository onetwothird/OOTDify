// A short buzz for feedback (a sent comment, a like, an error), honouring the
// Vibration setting. Uses React Native's Vibration, so it needs no extra
// native module (Android's VIBRATE permission is already declared).
import { Vibration } from "react-native";

import { useSettingsStore } from "../../features/settings/settingsStore";

export type BuzzKind = "tap" | "success" | "error";

const PATTERN: Record<BuzzKind, number | number[]> = {
  tap: 12,
  success: 22,
  // Two quick pulses: something went wrong.
  error: [0, 30, 70, 30],
};

export function buzz(kind: BuzzKind): void {
  if (!useSettingsStore.getState().vibration) return;
  try {
    Vibration.vibrate(PATTERN[kind]);
  } catch {
    /* no vibrator: non-fatal */
  }
}
