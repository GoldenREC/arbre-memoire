import ThemeToggle from './ThemeToggle.jsx';
import NotificationBell from './NotificationBell.jsx';
import { useAuthStore } from '../../store/useAuthStore.js';
import { ROLE_LABELS } from '../../lib/db/invitations.js';

export default function Topbar({ onMenuClick = () => {} }) {
  const { user, role, signOut } = useAuthStore();

  const roleLabel = ROLE_LABELS[role] || null;

  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b border-neutral-200 bg-white px-3 sm:px-6 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex min-w-0 items-center gap-2">
        {/* Bouton hamburger : uniquement sous le point de rupture "md", où la
            sidebar devient un tiroir coulissant plutôt qu'une colonne fixe. */}
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800 md:hidden"
          aria-label="Ouvrir le menu"
          title="Menu"
        >
          ☰
        </button>
        {roleLabel && (
          <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {roleLabel}
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
        {user && <NotificationBell />}
        <ThemeToggle />
        {user ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden max-w-[12rem] truncate text-sm text-neutral-600 sm:inline dark:text-neutral-300">
              {user.email}
            </span>
            <button
              onClick={signOut}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              title={user.email}
            >
              Déconnexion
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
