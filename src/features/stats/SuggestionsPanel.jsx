import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { detectSurnameInconsistencies, detectPlaceInconsistencies } from './suggestionsEngine.js';
import { renameIndividualLastName, mergePlaces, dismissSuggestion } from './suggestionActions.js';

function actionLabel(suggestion) {
  return suggestion.type === 'merge_place' ? 'Fusionner les lieux' : 'Modifier cette fiche';
}

/**
 * Panneau "Suggestions" de la page Audit : coquilles probables sur les
 * noms de famille (variante rare d'un nom par ailleurs très présent
 * chez un parent direct) et sur les lieux (deux orthographes proches
 * d'une même commune). Chaque suggestion propose une correction
 * directe ("Modifier cette fiche" / "Fusionner les lieux") ou peut être
 * ignorée définitivement ("Ignorer la suggestion").
 *
 * Contrairement aux "Constats" (auditEngine.js — incohérences
 * chronologiques, doublons de fiches), ces suggestions ne sont que des
 * indices statistiques (une orthographe rare face à une orthographe
 * dominante) : elles peuvent être de fausses pistes légitimes
 * (changement de nom, lieu-dit réellement distinct), d'où la
 * confirmation en deux temps avant d'agir.
 */
export default function SuggestionsPanel({ treeId, individuals, filiations, places, placeUsageCounts, dismissedKeys, individualsById, onChanged }) {
  const [armedId, setArmedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const suggestions = useMemo(() => {
    const all = [
      ...detectSurnameInconsistencies(individuals, filiations),
      ...detectPlaceInconsistencies(places, placeUsageCounts),
    ];
    return all.filter((s) => !dismissedKeys.has(s.id));
  }, [individuals, filiations, places, placeUsageCounts, dismissedKeys]);

  async function handleApply(finding) {
    setError(null);
    setBusyId(finding.id);
    try {
      if (finding.suggestion.type === 'rename_individual') {
        await renameIndividualLastName(finding.suggestion.individualId, finding.suggestion.to);
      } else if (finding.suggestion.type === 'merge_place') {
        await mergePlaces({ treeId, keepPlaceId: finding.suggestion.keepPlaceId, removePlaceId: finding.suggestion.removePlaceId });
      }
      setArmedId(null);
      onChanged();
    } catch (err) {
      setError(err.message || "Erreur lors de l'application de la suggestion.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleIgnore(finding) {
    setError(null);
    setBusyId(finding.id);
    try {
      await dismissSuggestion({ treeId, suggestionKey: finding.id });
      setArmedId(null);
      onChanged();
    } catch (err) {
      setError(err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Suggestions</h2>
        <span className="text-xs text-neutral-400">{suggestions.length}</span>
      </div>
      <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
        Variantes de nom ou de lieu probablement mal transcrites, repérées par comparaison avec l'orthographe la plus répandue dans l'arbre.
      </p>

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      {suggestions.length === 0 ? (
        <p className="text-sm text-neutral-400">Aucune suggestion pour l'instant.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {suggestions.map((f) => {
            const isArmed = armedId === f.id;
            const isBusy = busyId === f.id;
            return (
              <li key={f.id} className="py-2.5">
                <p className="text-sm text-neutral-700 dark:text-neutral-200">{f.message}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                  {f.individualIds.map((id) => (
                    <Link key={id} to={`/individus/${id}`} className="text-accent-600 hover:underline dark:text-accent-400">
                      → {`${individualsById.get(id)?.firstNames || ''} ${individualsById.get(id)?.lastName || ''}`.trim() || 'Fiche'}
                    </Link>
                  ))}

                  {!isArmed && (
                    <>
                      <button
                        disabled={isBusy}
                        onClick={() => setArmedId(f.id)}
                        className="rounded-full bg-accent-600 px-2 py-0.5 font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                      >
                        {actionLabel(f.suggestion)}
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() => handleIgnore(f)}
                        className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600 hover:bg-neutral-200 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        {isBusy ? '…' : 'Ignorer la suggestion'}
                      </button>
                    </>
                  )}

                  {isArmed && (
                    <>
                      <span className="text-neutral-500 dark:text-neutral-400">Confirmer ?</span>
                      <button
                        disabled={isBusy}
                        onClick={() => handleApply(f)}
                        className="rounded-full bg-accent-600 px-2 py-0.5 font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                      >
                        {isBusy ? '…' : 'Oui, appliquer'}
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() => setArmedId(null)}
                        className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600 hover:bg-neutral-200 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        Annuler
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
