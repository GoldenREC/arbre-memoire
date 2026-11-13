import { useEffect, useState } from 'react';
import { fetchRecordHistoryFor } from '../../lib/db/adminMaintenance.js';

const FIELD_LABELS = {
  first_names: 'Prénoms', last_name: 'Nom', birth_name: 'Nom de naissance', nickname: 'Surnom', sex: 'Sexe',
  birth_date: 'Date de naissance', death_date: 'Date de décès', is_deceased: 'Décédé', occupation: 'Profession', biography: 'Biographie',
};

function formatValue(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  return String(v);
}

/**
 * Onglet "Historique" d'une fiche individu : qui a modifié quoi, et
 * quand — admins compris, personne n'est exempté (voir settings.sql,
 * déclencheur log_record_history()). Volontairement centré sur les
 * champs d'état civil de cette fiche ; le journal complet
 * (événements, unions, toutes fiches) reste accessible aux
 * administrateurs depuis Paramètres → Maintenance.
 */
export default function HistoryTab({ individual }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchRecordHistoryFor(individual.treeId, 'individuals', individual.id)
      .then((rows) => { if (!cancelled) setHistory(rows); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [individual.treeId, individual.id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!history) return <p className="text-sm text-neutral-400">Chargement de l'historique…</p>;
  if (history.length === 0) return <p className="text-sm text-neutral-400">Aucune modification enregistrée pour cette fiche.</p>;

  return (
    <ul className="space-y-3">
      {history.map((h) => (
        <li key={h.id} className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
            <span>
              <span className="font-medium text-neutral-700 dark:text-neutral-200">
                {{ insert: 'Création', update: 'Modification', delete: 'Suppression' }[h.operation] || h.operation}
              </span>{' '}
              par {h.changedByEmail || 'système'}
            </span>
            <span>{new Date(h.changedAt).toLocaleString('fr-FR')}</span>
          </div>
          {h.operation === 'update' && (
            <ul className="mt-1 space-y-0.5 text-xs">
              {Object.entries(h.changes).map(([field, diff]) => (
                <li key={field} className="text-neutral-600 dark:text-neutral-300">
                  <span className="font-medium">{FIELD_LABELS[field] || field}</span> : {formatValue(diff.from)} → {formatValue(diff.to)}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
