// C:\OOTDify\src\shared\i18n\useT.ts
// React binding for the translation layer. Reads the persisted language from
// the settings store, so flipping English <-> Filipino in Settings re-renders
// every component that calls `useT()` immediately — no restart or reload.
import { useCallback, useMemo } from "react";

import { useSettingsStore } from "../../features/settings/settingsStore";
import {
  localeTag,
  translate,
  translateLabel,
  type LanguageCode,
  type TranslateParams,
  type TranslationKey,
} from "./translate";

export interface I18n {
  language: LanguageCode;
  /** BCP-47 tag for Date / Intl formatting ("en-US" | "fil-PH"). */
  locale: string;
  t: (key: TranslationKey, params?: TranslateParams) => string;
  /** Display-only translation of a data value, e.g. tl("occasion", "Casual"). */
  tl: (prefix: string, value: string) => string;
}

export function useT(): I18n {
  const language = useSettingsStore((s) => s.language);
  const t = useCallback(
    (key: TranslationKey, params?: TranslateParams) =>
      translate(language, key, params),
    [language],
  );
  const tl = useCallback(
    (prefix: string, value: string) => translateLabel(language, prefix, value),
    [language],
  );
  return useMemo(
    () => ({ language, locale: localeTag(language), t, tl }),
    [language, t, tl],
  );
}

/** Non-hook access (event handlers / services) to the current language. */
export function translateNow(
  key: TranslationKey,
  params?: TranslateParams,
): string {
  return translate(useSettingsStore.getState().language, key, params);
}

export function currentLocale(): string {
  return localeTag(useSettingsStore.getState().language);
}
