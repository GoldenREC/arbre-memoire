import { useMemo, useState } from 'react';
import { mergeIndividuals, applyConflictResolutions } from '../../lib/dedupe/merge.js';
import { commitImport } from '../../lib/db/commitImport.js';
import { clearStagingArea } from '../../lib/db/localDb.js';
import { supabase } from '../../lib/supabaseClient.js';

const FIELD_LABELS = {
  firstNames: 'Prénoms', lastName: 'Nom', birthName: 'Nom de naissance', sex: 'Sexe',
  birthDate: 'Date de naissance', deathDate: 'Date de décès', occupation: 'Profession',
  biography: 'Biographie', isDeceased: 'Décédé(e)',
};

/**
 * Étape 2 du pipeline d'import : pour chaque individu entrant qui
 * ressemble fortement à un individu déjà présent, l'utilisateur choisit
 * de fusionner (en tranchant les champs en conflit) ou de garder les
 * deux fiches séparées. Rien n'est écrit en base avant le clic final
 * sur "Valider l'import".
 */
export default function MergeReview({ treeId, importBatchId, stagingModel, candidates, onDone }) {
  // Un seul meilleur candidat retenu par individu entrant (v1).
  const bestByIncoming = useMemo(() => {
    const map = new Map();
    for (const c of candidates) {
      const prev = map.get(c.incoming.localId);
      if (!prev || c.score > prev.score) map.set(c.incoming.localId, c);
    }
    return map;
  }, [candidates]);

  const [decisions, setDecisions] = useState(() => {
    const initial = {};
    for (const [localId, c] of bestByIncoming) {
      initial[localId] = c.score >= 0.85 ? 'merge' : 'separate';
    }
    return initial;
  });
  const [resolutions, setResolutions] = useState({}); // { [localId]: { [field]: 'existing'|'incoming' } }
  const [committing, setCommitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const matchedCount = bestByIncoming.size;
  const newCount = stagingModel.individuals.length - matchedCount;

  function setDecision(localId, value) {
    setDecisions((d) => ({ ...d, [localId]: value }));
  }
  function setResolution(localId, field, value) {
    setResolutions((r) => ({ ...r, [localId]: { ...r[localId], [field]: value } }));
  }

  async function handleValidate() {
    setCommitting(true);
    setErrorMsg(null);
    try {
      const finalIndividuals = stagingModel.individuals.map((incoming) => {
        const candidate = bestByIncoming.get(incoming.localId);
        const decision = decisions[incoming.localId];

        if (candidate && decision === 'merge') {
          const mergeResult = mergeIndividuals(candidate.existing, incoming);
          const resolved = applyConflictResolutions(mergeResult, resolutions[incoming.localId] || {});
          return { ...incoming, ...resolved, existingId: candidate.existing.id, localId: incoming.localId };
        }
        return { ...incoming, existingId: null };
      });

      await commitImport({
        treeId,
        importBatchId,
        places: stagingModel.places,
        sources: stagingModel.sources,
        individuals: finalIndividuals,
        families: stagingModel.families,
        filiations: stagingModel.filiations,
      });

      await supabase.from('import_batches').update({ status: 'completed' }).eq('id', importBatchId);
      await clearStagingArea();
      onDone();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "L'import a échoué pendant l'écriture en base.");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">Revue avant import</h1>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        {stagingModel.individuals.length} individus analysés — {matchedCount} ressemblent à des fiches
        existantes, {newCount} sont nouveaux.
      </p>

      {matchedCount === 0 ? (
        <p className="mb-6 rounded-lg bg-neutral-50 p-4 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
          Aucun doublon potentiel détecté. Tu peux valider l'import directement.
        </p>
      ) : (
        <div className="mb-6 space-y-4">
          {Array.from(bestByIncoming.entries()).map(([localId, candidate]) => (
            <DuplicateCard
              key={localId}
              candidate={candidate}
              decision={decisions[localId]}
              onDecisionChange={(v) => setDecision(localId, v)}
              resolution={resolutions[localId] || {}}
              onResolutionChange={(field, v) => setResolution(localId, field, v)}
            />
          ))}
        </div>
      )}

      {errorMsg && <p className="mb-4 text-sm text-red-600">{errorMsg}</p>}

      <button
        onClick={handleValidate}
        disabled={committing}
        className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
      >
        {committing ? 'Écriture en cours…' : "Valider l'import"}
      </button>
    </div>
  );
}

function DuplicateCard({ candidate, decision, onDecisionChange, resolution, onResolutionChange }) {
  const { existing, incoming, score } = candidate;
  const mergeResult = useMemo(() => mergeIndividuals(existing, incoming), [existing, incoming]);

  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">
          {incoming.firstNames} {incoming.lastName}
          <span className="ml-2 text-xs text-neutral-400">ressemblance {Math.round(score * 100)}%</span>
        </div>
        <div className="flex gap-2 text-xs">
          <button
            onClick={() => onDecisionChange('merge')}
            className={`rounded-full px-3 py-1 ${decision === 'merge' ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}
          >
            Fusionner
          </button>
          <button
            onClick={() => onDecisionChange('separate')}
            className={`rounded-full px-3 py-1 ${decision === 'separate' ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}
          >
            Garder séparés
          </button>
        </div>
      </div>

      {decision === 'merge' && mergeResult.conflicts.length > 0 && (
        <div className="space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <p className="text-xs text-neutral-400">Champs différents — choisis la valeur à garder :</p>
          {mergeResult.conflicts.map((conflict) => (
            <div key={conflict.field} className="grid grid-cols-[100px_1fr_1fr] items-center gap-2 text-xs">
              <span className="text-neutral-500">{FIELD_LABELS[conflict.field] || conflict.field}</span>
              <button
                onClick={() => onResolutionChange(conflict.field, 'existing')}
                className={`rounded border px-2 py-1 text-left ${(resolution[conflict.field] ?? 'existing') === 'existing' ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30' : 'border-neutral-200 dark:border-neutral-700'}`}
              >
                {String(conflict.existingValue ?? '—')}
              </button>
              <button
                onClick={() => onResolutionChange(conflict.field, 'incoming')}
                className={`rounded border px-2 py-1 text-left ${resolution[conflict.field] === 'incoming' ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30' : 'border-neutral-200 dark:border-neutral-700'}`}
              >
                {String(conflict.incomingValue ?? '—')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
