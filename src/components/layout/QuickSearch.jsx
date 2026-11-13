import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuthStore } from '../../store/useAuthStore.js';

/**
 * Recherche rapide globale (Ctrl/Cmd+K, ou "/" hors d'un champ de
 * saisie) : retrouver une fiche individu depuis n'importe quelle page,
 * sans repasser par la liste — voir useGlobalShortcuts.js.
 */
export default function QuickSearch({ onClose }) {
  const { currentTreeId } = useAuthStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('individuals')
        .select('id, first_names, last_name, birth_date')
        .eq('tree_id', currentTreeId)
        .or(`first_names.ilike.%${query}%,last_name.ilike.%${query}%`)
        .limit(8);
      if (!cancelled) {
        setResults(data || []);
        setActiveIndex(0);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, currentTreeId]);

  function openResult(r) {
    navigate(`/individus/${r.id}`);
    onClose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[activeIndex]) { e.preventDefault(); openResult(results[activeIndex]); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[15vh]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Chercher une personne dans l'arbre…"
          className="w-full border-b border-neutral-100 bg-transparent px-4 py-3 text-sm outline-none dark:border-neutral-800"
        />
        {results.length > 0 && (
          <ul className="max-h-72 overflow-y-auto py-1">
            {results.map((r, idx) => (
              <li key={r.id}>
                <button
                  onClick={() => openResult(r)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`block w-full px-4 py-2 text-left text-sm ${idx === activeIndex ? 'bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-200' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800'}`}
                >
                  {r.first_names} {r.last_name}
                  {r.birth_date && <span className="ml-1.5 text-neutral-400">({r.birth_date.slice(0, 4)})</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim().length >= 2 && results.length === 0 && (
          <p className="px-4 py-3 text-xs text-neutral-400">Aucun résultat.</p>
        )}
        <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-2 text-[11px] text-neutral-400 dark:border-neutral-800">
          <span>↑↓ naviguer · ↵ ouvrir</span>
          <span>Échap pour fermer</span>
        </div>
      </div>
    </div>
  );
}
