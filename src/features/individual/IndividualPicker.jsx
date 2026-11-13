import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';

/**
 * Champ de recherche compact pour choisir un individu existant dans
 * l'arbre (ajout d'un parent, d'un conjoint ou d'un enfant). `excludeIds`
 * évite de se proposer soi-même ou des personnes déjà liées.
 */
export default function IndividualPicker({ treeId, excludeIds = [], onSelect, placeholder = 'Chercher une personne…' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

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

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
      />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
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
        </ul>
      )}
    </div>
  );
}
