// i18n configuration using i18n-js
import i18n from 'i18n-js';

// Setup i18n with English and Filipino
i18n.locales = ['en', 'fil'];
i18n.defaultLocale = 'en';

// Load translation files
i18n.fetchNamespaces(['en', 'fil'], function() {
  // Translations will be loaded below
});

// Set translations from JSON files
import enTranslations from './en.json';
import filTranslations from './fil.json';

i18n.translations = {
  en: enTranslations,
  fil: filTranslations,
};

export default i18n;