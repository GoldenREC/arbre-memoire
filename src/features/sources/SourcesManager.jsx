import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.js';
import { listSources } from './sourcesMutations.js';
import SourceDetailModal from './SourceDetailModal.jsx';

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

  const filtered = sources.filter((s) =>
    `${s.title} ${s.repository || ''} ${s.call_number || ''}`.toLowerCase().includes(search.toLowerCase())
  );

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
        className="mb-4 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
      />

      {loading ? (
        <p className="text-sm text-neutral-400">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-neutral-400">Aucune source pour l'instant.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {filtered.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setEditing(s)}
                className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <span className="text-sm font-medium">{s.title}</span>
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
