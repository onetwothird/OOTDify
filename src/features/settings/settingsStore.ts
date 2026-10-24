// C:\OOTDify\src\features\settings\settingsStore.ts
// Persisted app preferences (language, appearance, biometric lock). These are
// DEVICE preferences, not account data — they live in AsyncStorage and are never
// synced to the server. Everything is real: changing a value here immediately
// affects the running app (see the settings screens for wiring).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type LanguageCode = "en" | "fil";
export type AppearanceMode = "system" | "light" | "dark";

interface SettingsState {
  language: LanguageCode;
  appearance: AppearanceMode;
  /** Require biometric/device unlock when returning to the app. */
  biometricLock: boolean;
  /** True once the persisted state has been read from disk. */
  hydrated: boolean;
  setLanguage: (language: LanguageCode) => void;
  setAppearance: (appearance: AppearanceMode) => void;
  setBiometricLock: (enabled: boolean) => void;
  setHydrated: () => void;
}

const STORAGE_KEY = "ootdify.settings.v1";

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: "en",
      appearance: "system",
      biometricLock: false,
      hydrated: false,
      setLanguage: (language) => set({ language }),
      setAppearance: (appearance) => set({ appearance }),
      setBiometricLock: (biometricLock) => set({ biometricLock }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ language, appearance, biometricLock }) => ({
        language,
        appearance,
        biometricLock,
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
