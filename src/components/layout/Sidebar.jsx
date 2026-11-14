import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function useSections() {
  const { t } = useTranslation();
  return [
    {
      label: t('nav.sectionGeneral'),
      items: [
        { to: '/', label: t('nav.dashboard'), icon: '🏠' },
        { to: '/import', label: t('nav.import'), icon: '📥' },
      ],
    },
    {
      label: t('nav.sectionTree'),
      items: [
        { to: '/arbre', label: t('nav.tree'), icon: '🌳' },
        { to: '/individus', label: t('nav.individuals'), icon: '🧑' },
        { to: '/carte', label: t('nav.map'), icon: '🗺️' },
      ],
    },
    {
      label: t('nav.sectionProof'),
      items: [
        { to: '/sources', label: t('nav.sources'), icon: '📜' },
        { to: '/photos', label: t('nav.photos'), icon: '🖼️' },
        { to: '/animaux', label: t('nav.pets'), icon: '🐾' },
      ],
    },
    {
      label: t('nav.sectionAnalysis'),
      items: [
        { to: '/statistiques', label: t('nav.statistics'), icon: '📊' },
        { to: '/audit', label: t('nav.audit'), icon: '🩺' },
        { to: '/unions', label: t('nav.unionReview'), icon: '💍' },
      ],
    },
    {
      label: '',
      items: [
        { to: '/parametres', label: t('nav.settings'), icon: '⚙️' },
      ],
    },
  ];
}

function linkClasses({ isActive }) {
  return [
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-accent-50 text-accent-700 dark:bg-accent-900/40 dark:text-accent-200'
      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white',
  ].join(' ');
}

export default function Sidebar({ open = false, onClose = () => {} }) {
  const sections = useSections();
  return (
    <>
      {/* Fond semi-transparent derrière le tiroir mobile : un clic referme le menu.
          Invisible et non-interactif en desktop (où la sidebar est toujours visible). */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-neutral-200',
          'bg-neutral-50 transition-transform duration-200 dark:border-neutral-800 dark:bg-neutral-900',
          'md:static md:z-auto md:translate-x-0 md:bg-neutral-50/60 md:dark:bg-neutral-900/60',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌿</span>
            <span className="text-sm font-semibold tracking-tight">Arbre & Mémoire</span>
          </div>
          {/* Bouton de fermeture : uniquement utile sur le tiroir mobile. */}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800 md:hidden"
            aria-label="Fermer le menu"
            title="Fermer"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
          {sections.map((section, idx) => (
            <div key={section.label || `section-${idx}`}>
              {section.label && (
                <div className="mb-1.5 px-3 text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                  {section.label}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.to} to={item.to} className={linkClasses} onClick={onClose}>
                    <span className="text-base leading-none">{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
