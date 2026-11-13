import { useEffect } from 'react';
import i18next from '../i18n/index.js';
import { useAuthStore } from '../store/useAuthStore.js';

/** Applique la langue d'interface choisie par le membre (Paramètres → Préférences) à i18next. */
export function useUiLanguageSync() {
  const uiLanguage = useAuthStore((s) => s.preferences?.uiLanguage);

  useEffect(() => {
    if (uiLanguage && i18next.language !== uiLanguage) {
      i18next.changeLanguage(uiLanguage);
    }
  }, [uiLanguage]);
}
