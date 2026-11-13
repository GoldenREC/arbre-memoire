import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'genealogie:theme';
const THEME_EVENT = 'genealogie:theme-change';

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Mode sombre/clair persisté, appliqué via la classe `dark` sur <html>.
 * Plusieurs composants peuvent appeler ce hook en même temps (ex. le
 * bouton du Topbar et celui de Paramètres) : un évènement custom les
 * garde synchronisés entre eux, sans contexte React ni dépendance
 * supplémentaire.
 */
export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    function handleExternalChange(e) {
      if (e.detail && e.detail !== theme) setTheme(e.detail);
    }
    window.addEventListener(THEME_EVENT, handleExternalChange);
    return () => window.removeEventListener(THEME_EVENT, handleExternalChange);
  }, [theme]);

  const applyTheme = useCallback((next) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
    setTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, applyTheme]);

  return { theme, toggleTheme, setTheme: applyTheme };
}
