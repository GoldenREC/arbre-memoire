import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { fetchIndividualForMerge, mergeLiveIndividuals, commitMerge } from './mergeDuplicates.js';

const FIELD_LABELS = {
  firstNames: 'Prénoms', lastName: 'Nom', birthName: 'Nom de naissance', sex: 'Sexe',
  birthDate: 'Date de naissance', birthDatePrecision: 'Précision naissance',
  deathDate: 'Date de décès', deathDatePrecision: 'Précision décès',
  occupation: 'Profession', biography: 'Biographie', isDeceased: 'Décédé(e)',
};

function fullName(ind) {
  return `${ind?.firstNames || ''} ${ind?.lastName || ''}`.trim() || 'Personne inconnue';
}

/**
 * Fusion de deux fiches en double, ouverte depuis un constat "Doublon
 * potentiel" de l'Audit. Charge l'état civil complet des deux fiches
 * (le bundle Audit n'en a qu'un extrait), laisse choisir laquelle
 * conserver et trancher les champs en conflit (même principe que
 * MergeReview.jsx pour l'import), puis écrit la fusion : la fiche
 * supprimée disparaît de l'arbre, ses liens (parents, enfants, unions,
 * médias, sources...) sont repris par la fiche conservée.
 */
export default function MergeDuplicateDialog({ treeId, aId, bId, onClose, onMerged }) {
  const [state, setState] = useState({ loading: true, error: null, a: null, b: null });
  const [keepSide, setKeepSide] = useState('a');
  const [resolutions, setResolutions] = useState({});
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState(null);
  // Un double-clic peut partir avant que React n'ait eu le temps de
  // désactiver le bouton via `disabled={committing}` (son état ne se
  // répercute qu'au prochain rendu) : deux fusions concurrentes de la
  // même paire font alors échouer la seconde avec "fiche introuvable",
  // la première ayant déjà supprimé le doublon — rien n'est perdu, mais
  // l'erreur est trompeuse. Ce verrou, lu et posé de façon synchrone (pas
  // via un state React), bloque tout second appel tant que le premier
  // n'est pas terminé, quelle qu'en soit l'origine.
  const committingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchIndividualForMerge(aId), fetchIndividualForMerge(bId)])
      .then(([a, b]) => { if (!cancelled) setState({ loading: false, error: null, a, b }); })
      .catch((err) => { if (!cancelled) setState({ loading: false, error: err.message || 'Erreur de chargement.', a: null, b: null }); });
    return () => { cancelled = true; };
  }, [aId, bId]);

  const kept = keepSide === 'a' ? state.a : state.b;
  const removed = keepSide === 'a' ? state.b : state.a;

  const mergeResult = useMemo(() => (kept && removed ? mergeLiveIndividuals(kept, removed) : null), [kept, removed]);

  function setResolution(field, value) {
    setResolutions((r) => ({ ...r, [field]: value }));
  }

  async function handleMerge() {
    if (committingRef.current) return;
    committingRef.current = true;
    setCommitting(true);
    setCommitError(null);
    try {
      await commitMerge({ treeId, keepId: kept.id, removeId: removed.id, mergeResult, resolutions });
      onMerged();
    } catch (err) {
      console.error(err);
      setCommitError(err.message || 'La fusion a échoué.');
    } finally {
      committingRef.current = false;
      setCommitting(false);
    }
  }

  return (
    <Modal title="Fusionner ces deux fiches" onClose={onClose}>
      {state.loading && <p className="text-sm text-neutral-400">Chargement…</p>}
      {state.error && <p className="text-sm text-red-500">{state.error}</p>}

      {kept && removed && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
              Fiche à conserver — l'autre sera définitivement supprimée, après transfert de ses liens familiaux, unions, médias et sources vers celle-ci.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setKeepSide('a')}
                className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm ${keepSide === 'a' ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30' : 'border-neutral-200 dark:border-neutral-700'}`}
              >
                {fullName(state.a)}
              </button>
              <button
                onClick={() => setKeepSide('b')}
                className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm ${keepSide === 'b' ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30' : 'border-neutral-200 dark:border-neutral-700'}`}
              >
                {fullName(state.b)}
              </button>
            </div>
          </div>

          {mergeResult.conflicts.length > 0 ? (
            <div className="space-y-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <p className="text-xs text-neutral-400">Champs différents — choisis la valeur à garder :</p>
              {mergeResult.conflicts.map((conflict) => (
                <div key={conflict.field} className="space-y-1 text-xs">
                  <span className="text-neutral-500">{FIELD_LABELS[conflict.field] || conflict.field}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setResolution(conflict.field, 'existing')}
                      className={`flex-1 rounded border px-2 py-1 text-left ${(resolutions[conflict.field] ?? 'existing') === 'existing' ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30' : 'border-neutral-200 dark:border-neutral-700'}`}
                    >
                      {String(conflict.existingValue ?? '—')}
                    </button>
                    <button
                      onClick={() => setResolution(conflict.field, 'incoming')}
                      className={`flex-1 rounded border px-2 py-1 text-left ${resolutions[conflict.field] === 'incoming' ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30' : 'border-neutral-200 dark:border-neutral-700'}`}
                    >
                      {String(conflict.incomingValue ?? '—')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="border-t border-neutral-100 pt-3 text-xs text-neutral-400 dark:border-neutral-800">
              Aucun champ en conflit — la fiche conservée garde ses valeurs actuelles.
            </p>
          )}

          {commitError && <p className="text-sm text-red-600">{commitError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
              Annuler
            </button>
            <button
              onClick={handleMerge}
              disabled={committing}
              className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
            >
              {committing ? 'Fusion en cours…' : 'Fusionner'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
