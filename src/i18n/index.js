import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr.json';
import en from './locales/en.json';
import it from './locales/it.json';
import es from './locales/es.json';
import de from './locales/de.json';
import pt from './locales/pt.json';

/**
 * Infrastructure i18n : 6 langues exactement (fr/en/it/es/de/pt), voir
 * supabase/settings.sql (tree_members.ui_language). Couverture
 * volontairement limitée à la page Paramètres, à la navigation (Sidebar)
 * et aux libellés communs (boutons) — pas une retraduction intégrale de
 * l'application, qui reste en français ailleurs (voir ARCHITECTURE.md).
 * La langue effective est pilotée par useAuthStore.preferences.uiLanguage
 * (voir useUiLanguageSync.js), pas par la langue du navigateur.
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
];

i18next.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en }, it: { translation: it }, es: { translation: es }, de: { translation: de }, pt: { translation: pt } },
  lng: 'fr',
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18next;
