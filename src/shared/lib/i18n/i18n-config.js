// i18n configuration using i18n-js v4
import { I18n } from 'i18n-js';
import enTranslations from './en.json';
import filTranslations from './fil.json';

const i18n = new I18n();

// Setup i18n with English and Filipino
i18n.translations = {
  en: enTranslations,
  fil: filTranslations,
};

i18n.locale = 'en';
i18n.defaultLocale = 'en';
i18n.enableFallback = true;

export default i18n;