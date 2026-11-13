import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { applyPrivacyRules } from '../../lib/utils/privacy.js';
import { formatGenealogyDate } from '../../lib/utils/dates.js';

/**
 * Liste simple des individus de l'arbre courant, avec le masquage des
 * personnes vivantes appliqué pour les rôles qui n'y ont pas droit.
 * Chaque ligne ouvre la fiche détaillée (état civil, liens familiaux,
 * chronologie...).
 */
export default function IndividualsList() {
  const { currentTreeId, role, privacyThresholdYears } = useAuthStore();
  const [individuals, setIndividuals] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTreeId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('individuals')
        .select('id, first_names, last_name, sex, birth_date, birth_date_precision, death_date, is_deceased')
        .eq('tree_id', currentTreeId)
        .order('last_name', { ascending: true });

      if (!cancelled) {
        if (!error && data) {
          const mapped = data.map((r) => ({
            id: r.id,
            firstNames: r.first_names,
            lastName: r.last_name,
            sex: r.sex,
            birthDate: r.birth_date,
            birthDatePrecision: r.birth_date_precision,
            deathDate: r.death_date,
            isDeceased: r.is_deceased,
          }));
          setIndividuals(applyPrivacyRules(mapped, role, privacyThresholdYears));
        }
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [currentTreeId, role, privacyThresholdYears]);

  const filtered = individuals.filter((i) =>
    `${i.firstNames} ${i.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold">Fiches individus</h1>
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        {individuals.length} personne{individuals.length > 1 ? 's' : ''} dans l'arbre.
      </p>

      <input
        placeholder="Rechercher un nom…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
      />

      {loading ? (
        <p className="text-sm text-neutral-400">Chargement…</p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {filtered.map((ind) => (
            <li key={ind.id}>
              <Link
                to={ind.masked ? '#' : `/individus/${ind.id}`}
                className={`flex items-center justify-between px-4 py-3 ${ind.masked ? 'cursor-default' : 'hover:bg-neutral-50 dark:hover:bg-neutral-900'}`}
                onClick={(e) => ind.masked && e.preventDefault()}
              >
                <div>
                  <div className="text-sm font-medium">
                    {ind.firstNames} {ind.lastName}
                    {ind.masked && <span className="ml-2 text-xs text-neutral-400">(protégée)</span>}
                  </div>
                  <div className="text-xs text-neutral-400">
                    {ind.sex === 'M' ? '♂' : ind.sex === 'F' ? '♀' : ''}{' '}
                    {formatGenealogyDate({ date: ind.birthDate, datePrecision: ind.birthDatePrecision })}
                    {ind.isDeceased ? ' – †' : ''}
                  </div>
                </div>
              </Link>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-neutral-400">Aucun résultat.</li>
          )}
        </ul>
      )}
    </div>
  );
}
