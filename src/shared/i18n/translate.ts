// C:\OOTDify\src\shared\i18n\translate.ts
// Pure translation lookup — imports no React / React Native so it runs in the
// node Jest environment (same approach as shared/theme/resolveTheme.ts).
//
// Dictionaries are FLAT objects keyed by dotted ids ("home.recommended"). The
// English dictionary is the source of truth; every other language must provide
// exactly the same keys (enforced by the type of `fil` and by a unit test).
//
// Features:
//   * {name} interpolation:             t("home.greeting", { name: "Ana" })
//   * plurals via ".one" / ".other":    t("home.items", { count: 3 })
//   * graceful fallback: missing key in the active language -> English -> key
import type { LanguageCode } from "../../features/settings/settingsStore";
import { en } from "./en";
import { fil } from "./fil";

// Type-only import: erased at compile time, so AsyncStorage is never loaded in
// the node test environment. One definition of the language union app-wide.
export type { LanguageCode };

type Keys = keyof typeof en;
type StripPlural<K> = K extends `${infer B}.one` | `${infer B}.other` ? B : K;

/** Every translatable id (plural keys are addressed by their base name). */
export type TranslationKey = StripPlural<Keys>;
export type TranslateParams = Record<string, string | number>;

export const dictionaries: Record<LanguageCode, any> = {
  en,
  fil,
};
/** BCP-47 tag used for Date / Intl formatting. */
export function localeTag(language: LanguageCode): string {
  return language === "fil" ? "fil-PH" : "en-US";
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

function lookup(language: LanguageCode, id: string): string | undefined {
  return dictionaries[language][id] ?? dictionaries.en[id];
}

/** Resolve `key` (plural-aware) to a final string for `language`. */
export function translate(
  language: LanguageCode,
  key: TranslationKey,
  params?: TranslateParams,
): string {
  const id = key as string;
  if (params && typeof params.count === "number") {
    const form = params.count === 1 ? "one" : "other";
    const plural = lookup(language, `${id}.${form}`);
    if (plural !== undefined) return interpolate(plural, params);
  }
  const text = lookup(language, id);
  return text === undefined ? id : interpolate(text, params);
}

/**
 * Translate a DATA label (occasion, category, style…) when a translation
 * exists under `prefix.value`; otherwise return the value unchanged. The
 * stored value is never altered — only how it is displayed.
 */
export function translateLabel(
  language: LanguageCode,
  prefix: string,
  value: string,
): string {
  return lookup(language, `${prefix}.${value}`) ?? value;
}
