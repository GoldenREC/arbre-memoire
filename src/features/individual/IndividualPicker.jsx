import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import { createIndividual } from './individualMutations.js';
import { pushErrorToast } from '../../store/useToastStore.js';

/** Découpage naïf "Prénoms Nom" — point de départ corrigeable dans le mini-formulaire, pas une règle absolue. */
export function splitName(raw) {
  const tokens = raw.trim().split(/\s+/);
  if (tokens.length < 2) return { firstNames: '', lastName: tokens[0] || '' };
  return { firstNames: tokens.slice(0, -1).join(' '), lastName: tokens[tokens.length - 1] };
}

/**
 * Champ de recherche compact pour choisir un individu existant dans
 * l'arbre (ajout d'un parent, d'un conjoint ou d'un enfant). `excludeIds`
 * évite de se proposer soi-même ou des personnes déjà liées.
 *
 * `allowCreate` (avec `treeId`) ajoute une option "+ Créer une nouvelle
 * personne" quand la recherche ne trouve pas qui on cherche — sinon la
 * seule façon d'ajouter quelqu'un de nouveau serait un détour par
 * "Fiches individus", en perdant le contexte (on sait déjà qu'on est
 * en train de lui chercher un parent/conjoint/enfant).
 */
export default function IndividualPicker({ treeId, excludeIds = [], onSelect, placeholder = 'Chercher une personne…', allowCreate = false }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ firstNames: '', lastName: '', sex: 'U' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('individuals')
        .select('id, first_names, last_name, birth_date')
        .eq('tree_id', treeId)
        .or(`first_names.ilike.%${query}%,last_name.ilike.%${query}%`)
        .limit(8);
      if (!cancelled && !error) {
        setResults((data || []).filter((r) => !excludeIds.includes(r.id)));
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, treeId, excludeIds]);

  function openCreateForm() {
    setCreateForm(splitName(query));
    setCreating(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await createIndividual(treeId, createForm);
      onSelect(created);
      setCreating(false);
      setQuery('');
      setResults([]);
      setCreateForm({ firstNames: '', lastName: '', sex: 'U' });
    } catch (err) {
      pushErrorToast(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (creating) {
    return (
      <form onSubmit={handleCreate} className="space-y-1.5 rounded-lg border border-neutral-200 p-2 dark:border-neutral-700">
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Nouvelle personne</p>
        <div className="grid grid-cols-2 gap-1.5">
          <input
            autoFocus
            placeholder="Prénoms"
            value={createForm.firstNames}
            onChange={(e) => setCreateForm((f) => ({ ...f, firstNames: e.target.value }))}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            placeholder="Nom"
            value={createForm.lastName}
            onChange={(e) => setCreateForm((f) => ({ ...f, lastName: e.target.value }))}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <select
          value={createForm.sex}
          onChange={(e) => setCreateForm((f) => ({ ...f, sex: e.target.value }))}
          className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="U">Sexe non précisé</option>
          <option value="M">Masculin</option>
          <option value="F">Féminin</option>
        </select>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-60">
            {saving ? 'Création…' : 'Créer et ajouter'}
          </button>
          <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            Annuler
          </button>
        </div>
      </form>
    );
  }

  const showDropdown = results.length > 0 || (allowCreate && query.trim().length >= 2);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
      />
      {showDropdown && (
        <ul className="absolute z-[1200] mt-1 w-full rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {results.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => {
                  onSelect(r);
                  setQuery('');
                  setResults([]);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                {r.first_names} {r.last_name}
                {r.birth_date && <span className="ml-1 text-neutral-400">({r.birth_date.slice(0, 4)})</span>}
              </button>
            </li>
          ))}
          {allowCreate && query.trim().length >= 2 && (
            <li className={results.length > 0 ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}>
              <button
                onClick={openCreateForm}
                className="block w-full px-3 py-1.5 text-left text-sm text-accent-600 hover:bg-neutral-50 dark:text-accent-400 dark:hover:bg-neutral-800"
              >
                + Créer « {query.trim()} » comme nouvelle personne
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
