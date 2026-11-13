import Modal from '../ui/Modal.jsx';

const SHORTCUTS = [
  { keys: 'Ctrl/⌘ + K', desc: 'Recherche rapide — retrouver une fiche individu' },
  { keys: 'n', desc: 'Ouvrir / fermer les notifications' },
  { keys: '?', desc: 'Afficher ces raccourcis' },
  { keys: '← / →', desc: "Dans la visionneuse de photos ou d'actes : page précédente / suivante" },
  { keys: 'Échap', desc: 'Fermer une fenêtre, une visionneuse ou un menu' },
];

/** Aide "Raccourcis clavier" (touche ?), pour une navigation au clavier sans blocage — voir useGlobalShortcuts.js. */
export default function ShortcutsHelp({ onClose }) {
  return (
    <Modal title="Raccourcis clavier" onClose={onClose}>
      <ul className="space-y-2">
        {SHORTCUTS.map((s) => (
          <li key={s.keys} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-neutral-600 dark:text-neutral-300">{s.desc}</span>
            <kbd className="whitespace-nowrap rounded-md border border-neutral-300 bg-neutral-50 px-2 py-0.5 font-mono text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {s.keys}
            </kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
