import { useEffect, useState } from 'react';

function isTypingContext() {
  const el = document.activeElement;
  return ['TEXTAREA', 'INPUT', 'SELECT'].includes(el?.tagName) || el?.isContentEditable;
}

/**
 * Raccourcis globaux de l'application, montés une fois dans AppShell :
 * Ctrl/Cmd+K ouvre la recherche rapide, "?" affiche l'aide des
 * raccourcis. Désactivés quand le focus est dans un champ de saisie,
 * pour ne jamais bloquer la frappe normale (voir la revue finale des
 * raccourcis clavier — harmonisation sans conflit).
 */
export function useGlobalShortcuts() {
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickSearchOpen((o) => !o);
        return;
      }
      if (isTypingContext() || quickSearchOpen || helpOpen) return;
      if (e.key === '/') {
        e.preventDefault();
        setQuickSearchOpen(true);
      } else if (e.key === '?') {
        setHelpOpen(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quickSearchOpen, helpOpen]);

  return {
    quickSearchOpen,
    closeQuickSearch: () => setQuickSearchOpen(false),
    helpOpen,
    closeHelp: () => setHelpOpen(false),
  };
}
