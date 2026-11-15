import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useNotifications } from '../../hooks/useNotifications.js';

const KIND_ICON = { new_act: '📜', new_photo: '🖼️', birthday: '🎂', ownership_transfer: '🔁' };

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

/** Cloche de notifications de la barre supérieure — voir useNotifications.js. */
export default function NotificationBell() {
  const user = useAuthStore((s) => s.user);
  const trees = useAuthStore((s) => s.trees);
  const currentTreeId = useAuthStore((s) => s.currentTreeId);
  const setCurrentTreeId = useAuthStore((s) => s.setCurrentTreeId);
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(user?.id);
  const treeName = (id) => trees.find((t) => t.id === id)?.name || null;
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Raccourci global "n" pour ouvrir/fermer la cloche (voir useGlobalShortcuts.js),
  // désactivé quand le focus est dans un champ de saisie.
  useEffect(() => {
    function handleShortcut(e) {
      const typing = ['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (typing) return;
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) setOpen((o) => !o);
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  // Les alertes concernent tous les arbres : on bascule d'abord sur l'arbre concerné.
  async function handleClick(n) {
    if (!n.read_at) await markRead(n.id);
    setOpen(false);
    if (n.tree_id && n.tree_id !== currentTreeId && trees.some((t) => t.id === n.tree_id)) {
      await setCurrentTreeId(n.tree_id);
    }
    if (n.link) navigate(n.link);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        title="Notifications (raccourci : n)"
        data-shortcut-notifications
        className="relative rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2 dark:border-neutral-800">
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-accent-600 hover:underline">
                  Tout marquer comme lu
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 && <p className="px-3 py-6 text-center text-xs text-neutral-400">Aucune notification.</p>}
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex w-full gap-2.5 border-b border-neutral-50 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-neutral-50 dark:border-neutral-800/60 dark:hover:bg-neutral-800 ${!n.read_at ? 'bg-accent-50/50 dark:bg-accent-900/10' : ''}`}
                >
                  <span className="text-base leading-none">{KIND_ICON[n.kind] || '🔔'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-neutral-800 dark:text-neutral-100">{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">{n.body}</span>}
                    <span className="block text-[11px] text-neutral-400">
                      {treeName(n.tree_id) && <span className="mr-1.5 font-medium text-accent-700 dark:text-accent-300">{treeName(n.tree_id)}</span>}
                      {timeAgo(n.created_at)}
                    </span>
                  </span>
                  {!n.read_at && <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-accent-500" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
