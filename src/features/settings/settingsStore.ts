// C:\OOTDify\src\features\settings\settingsStore.ts
// Persisted app preferences (language, appearance, biometric lock). These are
// DEVICE preferences, not account data — they live in AsyncStorage and are never
// synced to the server. Everything is real: changing a value here immediately
// affects the running app (see the settings screens for wiring).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { TextSize } from "../../shared/theme/accessibility";
import { notePenggi } from "../home/penggiNotes";
import { DEFAULT_APPEARANCE, SETTINGS_VERSION, migrateSettings } from "./settingsMigrate";

export type LanguageCode = "en" | "fil";
export type AppearanceMode = "system" | "light" | "dark";

interface SettingsState {
  language: LanguageCode;
  appearance: AppearanceMode;
  /** Require biometric/device unlock when returning to the app. */
  biometricLock: boolean;
  /** Short buzzes for feedback (sent, liked, errors). */
  vibration: boolean;
  /** Accessibility: text size, bold text, higher contrast, and less motion
   *  (on top of the phone's own Reduce Motion). */
  textSize: TextSize;
  boldText: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  /** True once the persisted state has been read from disk. */
  hydrated: boolean;
  setLanguage: (language: LanguageCode) => void;
  setAppearance: (appearance: AppearanceMode) => void;
  setBiometricLock: (enabled: boolean) => void;
  setVibration: (enabled: boolean) => void;
  setTextSize: (size: TextSize) => void;
  setBoldText: (enabled: boolean) => void;
  setHighContrast: (enabled: boolean) => void;
  setReduceMotion: (enabled: boolean) => void;
  setHydrated: () => void;
}

const STORAGE_KEY = "ootdify.settings.v1";

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: "en",
      appearance: DEFAULT_APPEARANCE,
      biometricLock: false,
      vibration: true,
      textSize: "default",
      boldText: false,
      highContrast: false,
      reduceMotion: false,
      hydrated: false,
      setLanguage: (language) => set({ language }),
      setAppearance: (appearance) => set({ appearance }),
      setBiometricLock: (biometricLock) => set({ biometricLock }),
      setVibration: (vibration) => set({ vibration }),
      setTextSize: (textSize) => set({ textSize }),
      setBoldText: (boldText) => set({ boldText }),
      setHighContrast: (highContrast) => set({ highContrast }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      version: SETTINGS_VERSION,
      migrate: (persisted, version) => migrateSettings(persisted, version) as unknown as SettingsState,
      partialize: ({ language, appearance, biometricLock, vibration, textSize, boldText, highContrast, reduceMotion }) => ({
        language,
        appearance,
        biometricLock,
        vibration,
        textSize,
        boldText,
        highContrast,
        reduceMotion,
      }),
      onRehydrateStorage: () => (state) => {
        // Mark hydrated after the first read so callers can wait for real values.
        state?.setHydrated();
      },
    },
  ),
);

// Rehydration runs during store creation, but its promise may resolve BEFORE
// this module finishes evaluating — in which case `onRehydrateStorage` already
// fired and no subscriber will ever see it. Guarantee the flag is set once the
// read settles, so the boot gate can never hang on a slow or empty storage.
void Promise.resolve(useSettingsStore.persist.rehydrate()).finally(() => {
  useSettingsStore.getState().setHydrated();
});

// Penggi mentions a setting you just changed when you next see Home. Only
// real changes count: the read from disk at launch is not one.
const onOff = (on: boolean) => (on ? "on" : "off");
useSettingsStore.subscribe((next, prev) => {
  if (!prev.hydrated) return;
  if (next.appearance !== prev.appearance) notePenggi("appearance", next.appearance);
  if (next.language !== prev.language) notePenggi("language", next.language);
  if (next.textSize !== prev.textSize) notePenggi("text_size", next.textSize);
  if (next.boldText !== prev.boldText) notePenggi("bold_text", onOff(next.boldText));
  if (next.highContrast !== prev.highContrast) notePenggi("high_contrast", onOff(next.highContrast));
  if (next.reduceMotion !== prev.reduceMotion) notePenggi("reduce_motion", onOff(next.reduceMotion));
  if (next.vibration !== prev.vibration) notePenggi("vibration", onOff(next.vibration));
  if (next.biometricLock !== prev.biometricLock) notePenggi("biometric_lock", onOff(next.biometricLock));
});
