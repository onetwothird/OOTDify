// i18n hook for React components
import { useEffect, useMemo } from 'react';
import { useLocales } from 'expo-localization';
import i18n from './i18n-config';
import { useSettingsStore } from '../../../features/settings/settingsStore';

// Map expo-localization locale codes to our supported locales
function normalizeLocale(locale: string): 'en' | 'fil' {
  if (locale.startsWith('fil') || locale.startsWith('tl')) return 'fil';
  return 'en';
}

export function useTranslation() {
  const locales = useLocales();
  const deviceLocale = useMemo(() => locales[0]?.languageCode ?? 'en', [locales]);
  const { language, setLanguage } = useSettingsStore();
  const normalized = normalizeLocale(deviceLocale);

  // Sync device locale on first mount
  useEffect(() => {
    if (language === 'system') {
      i18n.locale = normalized;
    } else {
      i18n.locale = language;
    }
  }, [language, normalized]);

  const t = (key: string, options?: Record<string, string | number>) => {
    return i18n.t(key, options);
  };

  const changeLanguage = (lang: 'en' | 'fil' | 'system') => {
    setLanguage(lang);
    if (lang === 'system') {
      i18n.locale = normalized;
    } else {
      i18n.locale = lang;
    }
  };

  return { t, locale: i18n.locale, changeLanguage, availableLocales: ['en', 'fil'] as const };
}

export { i18n };
export default i18n;