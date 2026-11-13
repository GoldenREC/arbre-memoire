import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuthStore } from '../../store/useAuthStore.js';

export default function Dashboard() {
  const { currentTreeId, trees } = useAuthStore();
  const [counts, setCounts] = useState({ individuals: null, unions: null, places: null });

  useEffect(() => {
    if (!currentTreeId) return;
    let cancelled = false;

    async function loadCounts() {
      const [ind, uni, pla] = await Promise.all([
        supabase.from('individuals').select('id', { count: 'exact', head: true }).eq('tree_id', currentTreeId),
        supabase.from('unions').select('id', { count: 'exact', head: true }).eq('tree_id', currentTreeId),
        supabase.from('places').select('id', { count: 'exact', head: true }).eq('tree_id', currentTreeId),
      ]);
      if (!cancelled) {
        setCounts({ individuals: ind.count ?? 0, unions: uni.count ?? 0, places: pla.count ?? 0 });
      }
    }
    loadCounts();
    return () => { cancelled = true; };
  }, [currentTreeId]);

  const currentTree = trees.find((t) => t.id === currentTreeId);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">
        {currentTree ? currentTree.name : 'Tableau de bord'}
      </h1>
      <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">
        Vue d'ensemble de ton arbre généalogique.
      </p>

      <div className="mb-8 grid grid-cols-3 gap-4">
        <StatCard label="Individus" value={counts.individuals} />
        <StatCard label="Unions" value={counts.unions} />
        <StatCard label="Lieux" value={counts.places} />
      </div>

      {counts.individuals === 0 && (
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
