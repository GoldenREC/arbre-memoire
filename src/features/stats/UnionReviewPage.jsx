import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore.js';
import { loadStatsBundle } from './statsData.js';
import { buildUnionReviewRows, summarizeUnionReview } from './unionReview.js';
import UnionStatusForm from '../individual/UnionStatusForm.jsx';
import { RELATIONSHIP_STATUS_LABELS } from '../individual/unionMutations.js';
import { formatGenealogyDate } from '../../lib/utils/dates.js';

const FILTERS = [
  { value: 'suspect', label: 'Mariages sans preuve' },
  { value: 'all', label: 'Toutes' },
  { value: 'couple', label: 'En couple' },
  { value: 'married', label: 'Mariées' },
  { value: 'divorced', label: 'Divorcées' },
];

const STATUS_BADGE = {
  couple: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
  married: 'bg-accent-50 text-accent-700 dark:bg-accent-900/40 dark:text-accent-200',
  divorced: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
};

/**
 * Revue des unions : toutes les unions de l'arbre sur un seul écran,
 * pour corriger en série celles que l'ancien import avait marquées
 * "mariage" sans preuve. Rien de nouveau dans les principes : le bouton
 * "Modifier" ouvre le même formulaire de statut que la fiche individu
 * (UnionStatusForm), et "Passer en couple" ouvre ce même formulaire
 * pré-réglé sur "En couple" — il reste à choisir la preuve et enregistrer.
 */
export default function UnionReviewPage() {
  const currentTreeId = useAuthStore((s) => s.currentTreeId);
  const role = useAuthStore((s) => s.role);
  const canEdit = role === 'admin' || role === 'family';

  const [state, setState] = useState({ loading: true, error: null, bundle: null });
  const [filter, setFilter] = useState('suspect');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [presetStatus, setPresetStatus] = useState(null);

  const reload = useCallback(() => {
    if (!currentTreeId) return;
    loadStatsBundle(currentTreeId)
      .then((bundle) => setState({ loading: false, error: null, bundle }))
      .catch((err) => setState({ loading: false, error: err.message || 'Erreur de chargement.', bundle: null }));
  }, [currentTreeId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const rows = useMemo(() => (state.bundle ? buildUnionReviewRows(state.bundle) : []), [state.bundle]);
  const summary = useMemo(() => summarizeUnionReview(rows), [rows]);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'suspect' && !r.suspect) return false;
      if (filter !== 'suspect' && filter !== 'all' && r.status !== filter) return false;
      if (needle && !r.partnerNames.join(' ').toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, filter, search]);

  if (state.loading) return <p className="text-sm text-neutral-500">Chargement des unions…</p>;
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Revue des unions</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {summary.total} union{summary.total > 1 ? 's' : ''} : {summary.couple} en couple, {summary.married} mariée{summary.married > 1 ? 's' : ''},{' '}
          {summary.divorced} divorcée{summary.divorced > 1 ? 's' : ''}.{' '}
          {summary.suspect > 0
            ? `${summary.suspect} mariage${summary.suspect > 1 ? 's' : ''} sans aucune preuve rattachée, à vérifier.`
            : 'Tous les mariages ont une preuve rattachée.'}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={`rounded-full px-3 py-1 text-sm ${filter === f.value ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200'}`}
          >
            {f.label}
            {f.value === 'suspect' ? ` (${summary.suspect})` : ''}
          </button>
        ))}
        <input
          className="field ml-auto w-full sm:w-64"
          placeholder="Rechercher un conjoint…"
          aria-label="Rechercher un conjoint"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {visibleRows.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-800">
          {filter === 'suspect' ? 'Aucun mariage sans preuve : rien à corriger ici.' : 'Aucune union ne correspond.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visibleRows.map((row) => (
            <li key={row.union.id} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {row.partnerIds.length === 0 && 'Union sans conjoint enregistré'}
                    {row.partnerIds.map((id, i) => (
                      <span key={id}>
                        {i > 0 && <span className="text-neutral-400"> & </span>}
                        <Link to={`/individus/${id}`} className="hover:underline">{row.partnerNames[i]}</Link>
                      </span>
                    ))}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {row.date ? formatGenealogyDate({ date: row.date, datePrecision: row.datePrecision }) : 'Date inconnue'}
                    {row.placeLabel ? ` · ${row.placeLabel}` : ''}
                    {row.status !== 'couple' && (row.hasMarriageProof ? ' · preuve de mariage rattachée' : ' · aucune preuve de mariage')}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}>
                  {RELATIONSHIP_STATUS_LABELS[row.status]}
                </span>
                {canEdit && (
                  <div className="flex gap-2">
                    {row.suspect && (
                      <button
                        onClick={() => { setPresetStatus('couple'); setEditingId(row.union.id); }}
                        className="rounded-lg bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700"
                      >
                        Passer en couple
                      </button>
                    )}
                    <button
                      onClick={() => { setPresetStatus(null); setEditingId(editingId === row.union.id ? null : row.union.id); }}
                      className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                    >
                      {editingId === row.union.id ? 'Fermer' : 'Modifier'}
                    </button>
                  </div>
                )}
              </div>
              {editingId === row.union.id && (
                <div className="mt-3">
                  <UnionStatusForm
                    key={`${row.union.id}:${presetStatus || ''}`}
                    initialStatus={presetStatus || undefined}
                    treeId={currentTreeId}
                    union={row.union}
                    unionEvents={row.unionEvents}
                    onSaved={() => { setEditingId(null); reload(); }}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
