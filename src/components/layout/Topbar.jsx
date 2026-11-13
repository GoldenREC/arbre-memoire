import ThemeToggle from './ThemeToggle.jsx';
import NotificationBell from './NotificationBell.jsx';
import { useAuthStore } from '../../store/useAuthStore.js';
import { ROLE_LABELS } from '../../lib/db/invitations.js';

export default function Topbar() {
  const { user, role, signOut } = useAuthStore();

  const roleLabel = ROLE_LABELS[role] || null;

  return (
    <header className="flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-6 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="text-sm text-neutral-500 dark:text-neutral-400">
        {roleLabel && <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{roleLabel}</span>}
      </div>
      <div className="flex items-center gap-3">
        {user && <NotificationBell />}
        <ThemeToggle />
        {user ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-600 dark:text-neutral-300">{user.email}</span>
            <button
              onClick={signOut}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Déconnexion
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
