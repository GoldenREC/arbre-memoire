import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore.js';
import { loadStatsBundle, bulkNmdStatus } from './statsData.js';
import { runFullAudit } from './auditEngine.js';
import { severityStatus } from './chartColors.js';
import Meter from './charts/Meter.jsx';
import MergeDuplicateDialog from './MergeDuplicateDialog.jsx';
import SuggestionsPanel from './SuggestionsPanel.jsx';
import { cleanupTreeEventDuplicates } from './cleanupDuplicates.js';

const KIND_LABELS = {
  death_before_birth: 'Décès avant naissance',
  parent_born_after_child: 'Parent né après son enfant',
  parent_too_young: 'Parent anormalement jeune',
  child_born_after_parent_death: "Naissance après le décès d'un parent",
  marriage_aberrant_age: 'Mariage à un âge aberrant',
  potential_duplicate: 'Doublon potentiel',
  duplicate_union_exact: 'Unions en double (mêmes partenaires)',
  duplicate_union_likely: 'Unions probablement en double',
  orphan: 'Fiche isolée',
};

const SEVERITY_FILTERS = [
  { key: null, label: 'Tout' },
  { key: 'high', label: 'Élevé' },
  { key: 'medium', label: 'Moyen' },
  { key: 'low', label: 'Faible' },
];

function StatTile({ label, value }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{value ?? '—'}</div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
    </div>
  );
}

function fullName(ind) {
  return `${ind?.firstNames || ''} ${ind?.lastName || ''}`.trim() || 'Personne inconnue';
}

/**
 * Audit de cohérence de l'arbre : anomalies chronologiques, doublons
 * potentiels et fiches isolées (auditEngine.js, moteur pur), avec
 * accès direct à chaque fiche concernée, et un suivi de la
 * progression des actes N/M/D (même calcul que les pastilles des
 * fiches individu, via statsData.bulkNmdStatus).
 */
export default function AuditPage() {
  const { currentTreeId } = useAuthStore();
  const [state, setState] = useState({ loading: true, error: null, bundle: null });
  const [severityFilter, setSeverityFilter] = useState(null);
  const [mergeCandidate, setMergeCandidate] = useState(null); // { aId, bId } | null
  const [cleanup, setCleanup] = useState({ running: false, result: null, error: null });

  const reload = useCallback(() => {
    if (!currentTreeId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    loadStatsBundle(currentTreeId)
      .then((bundle) => setState({ loading: false, error: null, bundle }))
      .catch((err) => setState({ loading: false, error: err.message || 'Erreur de chargement.', bundle: null }));
  }, [currentTreeId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const individualsById = useMemo(() => (state.bundle ? new Map(state.bundle.individuals.map((i) => [i.id, i])) : null), [state.bundle]);

  const findings = useMemo(() => {
    if (!state.bundle) return [];
    const { individuals, filiations, unions, partnersByUnion, unionPartners } = state.bundle;
    return runFullAudit({ individuals, filiations, unions, partnersByUnion, unionPartners });
  }, [state.bundle]);

  const nmdByIndividual = useMemo(() => (state.bundle ? bulkNmdStatus(state.bundle) : null), [state.bundle]);

  const nmdCoverage = useMemo(() => {
    if (!state.bundle || !nmdByIndividual) return null;
    const { individuals } = state.bundle;
    const deceased = individuals.filter((i) => i.isDeceased);
    let withMarriage = 0;
    let marriageValidated = 0;
    let birthValidated = 0;
    let deathValidated = 0;
    for (const ind of individuals) {
      const s = nmdByIndividual.get(ind.id);
      if (!s) continue;
      if (s.birth.hasAct) birthValidated += 1;
      if (ind.isDeceased && s.death.hasAct) deathValidated += 1;
      if (s.marriage.options.length > 0) {
        withMarriage += 1;
        if (s.marriage.hasAct) marriageValidated += 1;
      }
    }
    const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
    return {
      birth: { percent: pct(birthValidated, individuals.length), count: individuals.length },
      death: { percent: pct(deathValidated, deceased.length), count: deceased.length },
      marriage: { percent: pct(marriageValidated, withMarriage), count: withMarriage },
    };
  }, [state.bundle, nmdByIndividual]);

  const countsBySeverity = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 };
    for (const f of findings) c[f.severity] += 1;
    return c;
  }, [findings]);

  const visibleFindings = severityFilter ? findings.filter((f) => f.severity === severityFilter) : findings;

  async function handleCleanupDuplicates() {
    if (!currentTreeId) return;
    setCleanup({ running: true, result: null, error: null });
    try {
      const result = await cleanupTreeEventDuplicates(currentTreeId);
      setCleanup({ running: false, result, error: null });
      reload();
    } catch (err) {
      setCleanup({ running: false, result: null, error: err.message || 'Erreur lors du nettoyage.' });
    }
  }

  if (state.loading) return <p className="text-sm text-neutral-400">Chargement de l'audit…</p>;
  if (state.error) return <p className="text-sm text-red-500">{state.error}</p>;
  if (!state.bundle || state.bundle.individuals.length === 0) {
    return <p className="text-sm text-neutral-400">L'arbre est vide pour l'instant — rien à auditer.</p>;
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Audit — incohérences</h1>
      <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
        Détection automatique d'anomalies chronologiques, de doublons potentiels et de fiches isolées. Les seuils utilisés sont des repères à vérifier, jamais des certitudes.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={handleCleanupDuplicates}
          disabled={cleanup.running}
          className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-200"
        >
          {cleanup.running ? 'Nettoyage en cours…' : 'Nettoyer les doublons (événements, unions, sources)'}
        </button>
        {cleanup.result && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {cleanup.result.unionsMerged} union(s) fusionnée(s), {cleanup.result.eventsRemoved} événement(s) en double supprimé(s)
            {cleanup.result.sourcesRemoved === null
              ? '. Sources non traitées : exécute supabase/dedupe_sources.sql dans Supabase.'
              : `, ${cleanup.result.sourcesRemoved} source(s) en double supprimée(s).`}
          </span>
        )}
        {cleanup.error && <span className="text-xs text-red-500">{cleanup.error}</span>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Constats au total" value={findings.length} />
        <StatTile label="Sévérité élevée" value={countsBySeverity.high} />
        <StatTile label="Sévérité moyenne" value={countsBySeverity.medium} />
        <StatTile label="Sévérité faible" value={countsBySeverity.low} />
      </div>

      <div className="mb-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-semibold text-neutral-800 dark:text-neutral-100">Progression des actes N/M/D</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Meter label="Naissances avec acte validé" percent={nmdCoverage.birth.percent} count={nmdCoverage.birth.count} />
          <Meter label="Décès avec acte validé" percent={nmdCoverage.death.percent} count={nmdCoverage.death.count} />
          <Meter label="Mariages avec acte validé" percent={nmdCoverage.marriage.percent} count={nmdCoverage.marriage.count} />
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Constats</h2>
          <div className="flex gap-1">
            {SEVERITY_FILTERS.map((f) => (
              <button
                key={f.label}
                onClick={() => setSeverityFilter(f.key)}
                className={`rounded px-2 py-0.5 text-xs ${severityFilter === f.key ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {visibleFindings.length === 0 ? (
          <p className="text-sm text-neutral-400">Aucun constat pour ce filtre — bon signe !</p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {visibleFindings.map((f) => {
              const status = severityStatus(f.severity);
              return (
                <li key={f.id} className="flex items-start gap-3 py-2.5">
                  <span className="mt-0.5 flex-none whitespace-nowrap text-xs font-medium" style={{ color: status.light }}>
                    {status.icon} {status.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-neutral-700 dark:text-neutral-200">{f.message}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                      <span>{KIND_LABELS[f.kind] || f.kind}</span>
                      {f.individualIds.map((id) => (
                        <Link key={id} to={`/individus/${id}`} className="text-accent-600 hover:underline dark:text-accent-400">
                          → {fullName(individualsById.get(id))}
                        </Link>
                      ))}
                      {(f.kind === 'duplicate_union_exact' || f.kind === 'duplicate_union_likely') && (
                        <Link to="/unions" className="text-accent-600 hover:underline dark:text-accent-400">→ Revue des unions</Link>
                      )}
                      {f.kind === 'potential_duplicate' && (
                        <button
                          onClick={() => setMergeCandidate({ aId: f.individualIds[0], bId: f.individualIds[1] })}
                          className="rounded-full bg-accent-600 px-2 py-0.5 font-medium text-white hover:bg-accent-700"
                        >
                          Fusionner
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <SuggestionsPanel
        treeId={currentTreeId}
        individuals={state.bundle.individuals}
        filiations={state.bundle.filiations}
        places={state.bundle.places}
        placeUsageCounts={state.bundle.placeUsageCounts}
        dismissedKeys={state.bundle.dismissedSuggestionKeys}
        individualsById={individualsById}
        onChanged={reload}
      />

      {mergeCandidate && (
        <MergeDuplicateDialog
          treeId={currentTreeId}
          aId={mergeCandidate.aId}
          bId={mergeCandidate.bId}
          onClose={() => setMergeCandidate(null)}
          onMerged={() => { setMergeCandidate(null); reload(); }}
        />
      )}
    </div>
  );
}
