import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.js';
import { fetchEffectiveLocks, setLock } from '../../lib/db/ownership.js';

/**
 * Cadenas visible par tous les membres.
 *  - cadenas posé directement : badge « Cadenassé » ; le propriétaire peut le retirer ;
 *  - protection héritée (conjoint cadenassé, événement ou acte lié à une fiche
 *    cadenassée) : badge « Protégé » avec la raison, sans bouton, pour tous ;
 *  - rien : le propriétaire voit « Cadenasser », les autres ne voient rien.
 * Les règles réelles sont appliquées par la base (supabase/multi_tree.sql) ;
 * ce composant ne fait qu'afficher l'état renvoyé par effective_locks.
 *
 * kind : 'individual' (fiche) | 'media' (acte ou permalien) | 'event'
 */
export default function LockToggle({ treeId, kind, targetId, compact = false, onStateChange = () => {} }) {
  const { user, isOwner } = useAuthStore();
  const [info, setInfo] = useState(null); // null = pas encore chargé ; false = non protégé
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const direct = !!info && info.direct;
  const inherited = !!info && !info.direct;
  const protectedNow = !!info;

  async function load() {
    try {
      const map = await fetchEffectiveLocks(treeId);
      const found = map.get(`${kind}:${targetId}`) || false;
      setInfo(found);
      onStateChange(!!found);
    } catch {
      setInfo(false);
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
      await setLock(treeId, kind, targetId, !direct, user?.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (info === null) return null;
  // Non protégé : seul le propriétaire voit le bouton pour cadenasser.
  if (!protectedNow && !isOwner) return null;

  const sizeClass = compact ? 'text-[11px]' : 'text-xs';

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${sizeClass}`}>
      {direct && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" title="Cadenassé par le propriétaire">
          🔒 Cadenassé
        </span>
      )}
      {inherited && (
        <span className="rounded-full bg-neutral-200 px-2 py-0.5 font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200" title="Protégé par cascade : le cadenas est posé ailleurs. Seul le propriétaire peut le lever à la source.">
          🔒 Protégé : {info.reason}
        </span>
      )}
      {isOwner && !protectedNow && (
        <button
          onClick={toggle}
          disabled={busy}
          className="text-neutral-500 underline-offset-2 hover:text-accent-600 hover:underline disabled:opacity-50"
        >
          {busy ? '…' : 'Cadenasser'}
        </button>
      )}
      {isOwner && direct && (
        <button
          onClick={toggle}
          disabled={busy}
          className="text-neutral-500 underline-offset-2 hover:text-accent-600 hover:underline disabled:opacity-50"
        >
          {busy ? '…' : 'Retirer le cadenas'}
        </button>
      )}
      {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
