import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.js';
import { listPets } from './petsMutations.js';
import { formatGenealogyDate } from '../../lib/utils/dates.js';
import PetDetailModal from './PetDetailModal.jsx';

/**
 * Point d'entrée du module Animaux : liste/recherche de tous les
 * animaux de compagnie de l'arbre, création, ouverture de la fiche
 * détaillée (photos, membres de la famille associés).
 */
export default function PetsManager() {
  const { currentTreeId, role } = useAuthStore();
  const canEdit = role === 'admin';
  const [pets, setPets] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // pet | 'new' | null

  async function reload() {
    if (!currentTreeId) return;
    setLoading(true);
    setPets(await listPets(currentTreeId));
    setLoading(false);
  }

  useEffect(() => { reload(); }, [currentTreeId]);

  const filtered = pets.filter((p) => `${p.name} ${p.species || ''} ${p.breed || ''}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-2xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Animaux de compagnie</h1>
        {canEdit && (
          <button onClick={() => setEditing('new')} className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700">
            + Nouvel animal
          </button>
        )}
      </div>
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        {pets.length} animal{pets.length > 1 ? 'aux' : ''} enregistré{pets.length > 1 ? 's' : ''} dans l'arbre.
      </p>

      <input
        placeholder="Rechercher par nom, espèce, race…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
      />

      {loading ? (
        <p className="text-sm text-neutral-400">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-neutral-400">Aucun animal pour l'instant.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {filtered.map((p) => (
            <li key={p.id}>
              <button onClick={() => setEditing(p)} className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900">
                <span className="text-sm font-medium">🐾 {p.name}</span>
                <span className="text-xs text-neutral-400">
                  {[p.species, p.breed].filter(Boolean).join(' — ') || 'Espèce non renseignée'}
                  {p.birthDate ? ` · né(e) ${formatGenealogyDate({ date: p.birthDate, datePrecision: 'exact' })}` : ''}
                  {p.deathDate ? ` – † ${formatGenealogyDate({ date: p.deathDate, datePrecision: 'exact' })}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <PetDetailModal
          treeId={currentTreeId}
          pet={editing === 'new' ? null : editing}
          canEdit={canEdit}
          onClose={() => { setEditing(null); reload(); }}
          onSaved={reload}
          onDeleted={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}
