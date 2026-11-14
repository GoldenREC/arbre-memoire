import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.js';
import { listSources } from './sourcesMutations.js';
import SourceDetailModal from './SourceDetailModal.jsx';
import { SOURCE_TYPE_LABELS, isUnreliableSourceUrl } from '../../lib/utils/sourceReliability.js';
import {
  PROOF_KIND_LABELS, EVENT_CATEGORY_LABELS, proofKindOf, eventCategoriesOf, filterSources, countSourcesByFilter,
} from './sourceFilters.js';

function FilterRow({ label, value, onChange, options, counts }) {
  const chip = (active) =>
    `rounded-full px-2.5 py-1 text-xs ${active ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="mr-1 text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
      <button className={chip(value === 'all')} aria-pressed={value === 'all'} onClick={() => onChange('all')}>Tous</button>
      {Object.entries(options).filter(([key]) => counts[key] > 0 || value === key).map(([key, text]) => (
        <button key={key} className={chip(value === key)} aria-pressed={value === key} onClick={() => onChange(key)}>
          {text} ({counts[key]})
        </button>
      ))}
    </div>
  );
}

/**
 * Point d'entrée du gestionnaire de sources : liste/recherche de
 * toutes les sources de l'arbre, création d'une nouvelle source,
 * ouverture de la fiche détaillée (actes, transcription, citations).
 */
export default function SourcesManager() {
  const { currentTreeId, role } = useAuthStore();
  const canEdit = role === 'admin' || role === 'family';
  const [sources, setSources] = useState([]);
  const [search, setSearch] = useState('');
  const [proofKind, setProofKind] = useState('all');
  const [eventCategory, setEventCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // source object | 'new' | null
  const [exportModal, setExportModal] = useState(false);

  async function reload() {
    if (!currentTreeId) return;
    setLoading(true);
    const data = await listSources(currentTreeId);
    setSources(data);
    setLoading(false);
  }

  useEffect(() => { reload(); }, [currentTreeId]);

  const filtered = filterSources(sources, { search, proofKind, eventCategory });
  const counts = countSourcesByFilter(sources);

  return (
    <div className="max-w-2xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sources & actes</h1>
        {canEdit && (
          <button
            onClick={() => setEditing('new')}
            className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
          >
            + Nouvelle source
          </button>
        )}
      </div>
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        {sources.length} source{sources.length > 1 ? 's' : ''} référencée{sources.length > 1 ? 's' : ''} dans l'arbre.
      </p>

      <input
        placeholder="Rechercher par titre, dépôt, cote…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
      />

      <div className="mb-4 space-y-2">
        <FilterRow label="Preuve" value={proofKind} onChange={setProofKind} options={PROOF_KIND_LABELS} counts={counts.proofKind} />
        <FilterRow label="Événement" value={eventCategory} onChange={setEventCategory} options={EVENT_CATEGORY_LABELS} counts={counts.eventCategory} />
        {!loading && filtered.length !== sources.length && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{filtered.length} source{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''}.</p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-neutral-400">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-neutral-400">{sources.length === 0 ? "Aucune source pour l'instant." : 'Aucune source ne correspond à ces filtres.'}</p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {filtered.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setEditing(s)}
                className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {s.title}
                  {proofKindOf(s) !== 'other' && (
                    <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-normal text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400" title={SOURCE_TYPE_LABELS[s.source_type] || undefined}>
                      {PROOF_KIND_LABELS[proofKindOf(s)]}
                    </span>
                  )}
                  {(s.eventTypes || []).length > 0 && eventCategoriesOf(s).map((c) => (
                    <span key={c} className="rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-normal text-accent-700 dark:bg-accent-900/40 dark:text-accent-200">
                      {EVENT_CATEGORY_LABELS[c]}
                    </span>
                  ))}
                  {isUnreliableSourceUrl(s.url) && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-normal text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title="URL vers un arbre collaboratif — à vérifier/remplacer par une preuve primaire">
                      ⚠ à vérifier
                    </span>
                  )}
                </span>
                <span className="text-xs text-neutral-400">
                  {[s.repository, s.call_number].filter(Boolean).join(' — ') || 'Aucune localisation renseignée'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <SourceDetailModal
          treeId={currentTreeId}
          source={editing === 'new' ? null : editing}
          canEdit={canEdit}
          onClose={() => { setEditing(null); reload(); }}
          onSaved={reload}
          onDeleted={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}
