import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { formatGenealogyDate } from '../../lib/utils/dates.js';
import { runFullAudit } from '../stats/auditEngine.js';

const SHORTCUTS = [
  { to: '/individus', label: 'Nouvel individu', icon: '🧑' },
  { to: '/import', label: 'Importer un GEDCOM', icon: '📥' },
  { to: '/arbre', label: 'Arbre généalogique', icon: '🌳' },
  { to: '/carte', label: 'Carte du monde', icon: '🗺️' },
];

/**
 * Charge un sous-ensemble léger (individus/filiations/unions) scopé à
 * l'arbre courant, suffisant pour runFullAudit — plus léger que
 * statsData.loadStatsBundle (10 requêtes, utile aux pages Statistiques/
 * Audit elles-mêmes) : ici on n'a besoin que d'un nombre de constats
 * pour la bannière, pas du détail affiché sur la page Audit.
 */
async function loadAuditFindingsCount(treeId) {
  const [{ data: individualRows }, { data: filiationRows }, { data: unionRows }, { data: partnerRows }] = await Promise.all([
    supabase.from('individuals').select('id, first_names, last_name, sex, birth_date, birth_date_precision, death_date, death_date_precision, is_deceased').eq('tree_id', treeId),
    supabase.from('filiations').select('id, child_id, parent_id, filiation_type').eq('tree_id', treeId),
    supabase.from('unions').select('id, union_type, status, start_date, start_date_precision').eq('tree_id', treeId),
    supabase.from('union_partners').select('union_id, individual_id, unions!inner(tree_id)').eq('unions.tree_id', treeId),
  ]);

  const individuals = (individualRows || []).map((r) => ({
    id: r.id, firstNames: r.first_names, lastName: r.last_name, sex: r.sex,
    birthDate: r.birth_date, birthDatePrecision: r.birth_date_precision,
    deathDate: r.death_date, deathDatePrecision: r.death_date_precision, isDeceased: r.is_deceased,
  }));
  const filiations = (filiationRows || []).map((f) => ({ id: f.id, childId: f.child_id, parentId: f.parent_id, filiationType: f.filiation_type }));
  const unions = (unionRows || []).map((u) => ({ id: u.id, unionType: u.union_type, status: u.status, startDate: u.start_date, startDatePrecision: u.start_date_precision }));
  const unionPartners = partnerRows || [];
  const partnersByUnion = new Map();
  for (const row of unionPartners) {
    if (!partnersByUnion.has(row.union_id)) partnersByUnion.set(row.union_id, []);
    partnersByUnion.get(row.union_id).push(row.individual_id);
  }

  return runFullAudit({ individuals, filiations, unions, partnersByUnion, unionPartners }).length;
}

export default function Dashboard() {
  const { currentTreeId, trees } = useAuthStore();
  const [counts, setCounts] = useState({ individuals: null, unions: null, places: null });
  const [recent, setRecent] = useState([]);
  const [auditCount, setAuditCount] = useState(null);

  useEffect(() => {
    if (!currentTreeId) return;
    let cancelled = false;

    async function loadCounts() {
      const [ind, uni, pla, lastAdded] = await Promise.all([
        supabase.from('individuals').select('id', { count: 'exact', head: true }).eq('tree_id', currentTreeId),
        supabase.from('unions').select('id', { count: 'exact', head: true }).eq('tree_id', currentTreeId),
        supabase.from('places').select('id', { count: 'exact', head: true }).eq('tree_id', currentTreeId),
        supabase.from('individuals').select('id, first_names, last_name, sex, birth_date, birth_date_precision, created_at').eq('tree_id', currentTreeId).order('created_at', { ascending: false }).limit(6),
      ]);
      if (!cancelled) {
        setCounts({ individuals: ind.count ?? 0, unions: uni.count ?? 0, places: pla.count ?? 0 });
        setRecent((lastAdded.data || []).map((r) => ({
          id: r.id, firstNames: r.first_names, lastName: r.last_name, sex: r.sex,
          birthDate: r.birth_date, birthDatePrecision: r.birth_date_precision,
        })));
      }
    }
    loadCounts();

    loadAuditFindingsCount(currentTreeId).then((n) => {
      if (!cancelled) setAuditCount(n);
    }).catch(() => {
      if (!cancelled) setAuditCount(null);
    });

    return () => { cancelled = true; };
  }, [currentTreeId]);

  const currentTree = trees.find((t) => t.id === currentTreeId);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">
        {currentTree ? currentTree.name : 'Tableau de bord'}
      </h1>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        Vue d'ensemble de ton arbre généalogique.
      </p>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard label="Individus" value={counts.individuals} />
        <StatCard label="Unions" value={counts.unions} />
        <StatCard label="Lieux" value={counts.places} />
      </div>

      {counts.individuals === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
            Ton arbre est vide pour le moment. Importe un fichier GEDCOM (.ged) pour démarrer.
          </p>
          <Link
            to="/import"
            className="inline-block rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
          >
            Importer un fichier GEDCOM
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {SHORTCUTS.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-neutral-200 p-3 text-center text-xs font-medium text-neutral-600 hover:border-accent-300 hover:bg-accent-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-accent-800 dark:hover:bg-accent-950"
              >
                <span className="text-lg">{s.icon}</span>
                {s.label}
              </Link>
            ))}
          </div>

          {auditCount > 0 && (
            <Link
              to="/audit"
              className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
            >
              <span className="text-amber-800 dark:text-amber-300">
                ⚠ {auditCount} incohérence{auditCount > 1 ? 's' : ''} détectée{auditCount > 1 ? 's' : ''} dans l'arbre
              </span>
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Voir l'audit →</span>
            </Link>
          )}

          {recent.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-200">Derniers individus ajoutés</h2>
              <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {recent.map((ind) => (
                  <li key={ind.id}>
                    <Link to={`/individus/${ind.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900">
                      <span>
                        {ind.firstNames} {ind.lastName}
                        {!ind.firstNames && !ind.lastName && <span className="text-neutral-400">Sans nom</span>}
                      </span>
                      <span className="text-xs text-neutral-400">
                        {ind.sex === 'M' ? '♂' : ind.sex === 'F' ? '♀' : ''}{' '}
                        {formatGenealogyDate({ date: ind.birthDate, datePrecision: ind.birthDatePrecision })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="text-2xl font-semibold">{value === null ? '—' : value}</div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
    </div>
  );
}
