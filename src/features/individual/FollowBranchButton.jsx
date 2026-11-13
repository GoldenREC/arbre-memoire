import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.js';
import { isFollowing, followIndividual, unfollowIndividual } from '../../lib/db/followedIndividuals.js';

/**
 * Bouton "Suivre cette branche" d'une fiche individu — alimente la
 * notification "nouveau portrait" (voir notify_new_photo() dans
 * supabase/settings.sql : la personne suivie ET tous ses descendants
 * déclenchent une alerte dès qu'un nouveau portrait leur est rattaché).
 * Gestion centralisée des branches suivies : Paramètres → Notifications.
 */
export default function FollowBranchButton({ individual }) {
  const { user } = useAuthStore();
  const [following, setFollowing] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    isFollowing(individual.treeId, user.id, individual.id).then(setFollowing);
  }, [individual.treeId, individual.id, user]);

  if (!user || following === null) return null;

  async function toggle() {
    setBusy(true);
    try {
      if (following) {
        await unfollowIndividual(individual.treeId, user.id, individual.id);
      } else {
        await followIndividual(individual.treeId, user.id, individual.id);
      }
      setFollowing(!following);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title="Recevoir une notification pour chaque nouveau portrait ajouté à cette branche"
      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
        following
          ? 'bg-accent-100 text-accent-700 hover:bg-accent-200 dark:bg-accent-900/40 dark:text-accent-200'
          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
      }`}
    >
      {following ? '★ Branche suivie' : '☆ Suivre cette branche'}
    </button>
  );
}
