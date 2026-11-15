import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.js';
import { fetchLockKeys, setLock } from '../../lib/db/ownership.js';

/**
 * Cadenas visible par tous les membres. Seul le propriétaire le pose ou le
 * retire ; les autres ne voient que l'état. Les règles réelles (suppression,
 * modification par les admins) sont appliquées par la base : voir
 * supabase/multi_tree.sql.
 *
 * kind : 'individual' (fiche) | 'media' (acte ou permalien) | 'event'
 */
export default function LockToggle({ treeId, kind, targetId, compact = false, onStateChange = () => {} }) {
  const { user, isOwner } = useAuthStore();
  const [locked, setLocked] = useState(null); // null = pas encore chargé
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const keys = await fetchLockKeys(treeId);
      const isLocked = keys.has(`${kind}:${targetId}`);
      setLocked(isLocked);
      onStateChange(isLocked);
    } catch {
      setLocked(false);
    }
  }

  useEffect(() => {
    if (treeId && targetId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeId, kind, targetId]);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await setLock(treeId, kind, targetId, !locked, user?.id);
      setLocked(!locked);
      onStateChange(!locked);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (locked === null) return null;
  // Non propriétaire : on n'affiche le cadenas que s'il est posé.
  if (!isOwner && !locked) return null;

  const sizeClass = compact ? 'text-[11px]' : 'text-xs';

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${sizeClass}`}>
      {locked && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" title="Cadenassé par le propriétaire">
          🔒 Cadenassé
        </span>
      )}
      {isOwner && (
        <button
          onClick={toggle}
          disabled={busy}
          className="text-neutral-500 underline-offset-2 hover:text-accent-600 hover:underline disabled:opacity-50"
        >
          {busy ? '…' : locked ? 'Retirer le cadenas' : 'Cadenasser'}
        </button>
      )}
      {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
