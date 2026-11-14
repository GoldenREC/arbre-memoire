import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { applyPrivacyRules } from '../../lib/utils/privacy.js';
import { formatGenealogyDate } from '../../lib/utils/dates.js';
import { createIndividual } from './individualMutations.js';
import { pushErrorToast } from '../../store/useToastStore.js';

/**
 * Liste simple des individus de l'arbre courant, avec le masquage des
 * personnes vivantes appliqué pour les rôles qui n'y ont pas droit.
 * Chaque ligne ouvre la fiche détaillée (état civil, liens familiaux,
 * chronologie...).
 */
export default function IndividualsList() {
  const { currentTreeId, role, privacyThresholdYears } = useAuthStore();
  const navigate = useNavigate();
  const canEdit = role === 'admin' || role === 'family';
  const [individuals, setIndividuals] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ firstNames: '', lastName: '', sex: 'U' });
  const [saving, setSaving] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await createIndividual(currentTreeId, createForm);
      navigate(`/individus/${created.id}`);
    } catch (err) {
      pushErrorToast(err.message);
      setSaving(false);
    }
  }

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
      <div className="mb-1 flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold">Fiches individus</h1>
        {canEdit && !creating && (
          <button
            onClick={() => setCreating(true)}
            className="shrink-0 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
          >
            + Nouvel individu
          </button>
        )}
      </div>
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        {individuals.length} personne{individuals.length > 1 ? 's' : ''} dans l'arbre.
      </p>

      {creating && (
        <form onSubmit={handleCreate} className="mb-4 space-y-2 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="grid grid-cols-2 gap-2">
            <input
              autoFocus
              placeholder="Prénoms"
              value={createForm.firstNames}
              onChange={(e) => setCreateForm((f) => ({ ...f, firstNames: e.target.value }))}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
            />
            <input
              placeholder="Nom"
              value={createForm.lastName}
              onChange={(e) => setCreateForm((f) => ({ ...f, lastName: e.target.value }))}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
          <select
            value={createForm.sex}
            onChange={(e) => setCreateForm((f) => ({ ...f, sex: e.target.value }))}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900 sm:w-auto"
          >
            <option value="U">Sexe non précisé</option>
            <option value="M">Masculin</option>
            <option value="F">Féminin</option>
          </select>
          <p className="text-xs text-neutral-400">Date de naissance, lieu, famille... tout ça se renseigne ensuite depuis la fiche.</p>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60">
              {saving ? 'Création…' : 'Créer la fiche'}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              Annuler
            </button>
          </div>
        </form>
      )}

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
