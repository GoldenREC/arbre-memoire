import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.js';
import { loadStatsBundle, bulkNmdStatus } from './statsData.js';
import {
  buildAgePyramid,
  lifeExpectancyByPeriod,
  marriageAgeStats,
  parenthoodAgeStats,
  birthsAndDeathsByDecade,
  detectMortalityPeaks,
  topNames,
  topPlaces,
  migrationFlows,
  completeness,
  completenessByGeneration,
  buildGenerationGraph,
} from './statsEngine.js';
import AgePyramidChart from './charts/AgePyramidChart.jsx';
import VerticalBars from './charts/VerticalBars.jsx';
import Meter from './charts/Meter.jsx';
import RankedBarList from './charts/RankedBarList.jsx';
import IndividualPicker from '../individual/IndividualPicker.jsx';

function Card({ title, subtitle, children, className = '' }) {
  return (
    <div className={`rounded-xl border border-neutral-200 p-4 dark:border-neutral-800 ${className}`}>
      <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{title}</h2>
      {subtitle && <p className="mb-3 mt-0.5 text-xs text-neutral-400">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{value ?? '—'}</div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-neutral-400">{sub}</div>}
    </div>
  );
}

/**
 * Tableau de bord statistique : démographie historique (pyramide des
 * âges, espérance de vie, âges au mariage/à la parentalité, pics de
 * mortalité), classements de prénoms/patronymes/lieux et flux
 * migratoires, et taux de complétude de l'arbre (global et par
 * génération). Toutes les valeurs viennent des moteurs purs de
 * statsEngine.js, chargés une fois via loadStatsBundle.
 */
export default function StatisticsPage() {
  const { currentTreeId } = useAuthStore();
  const [state, setState] = useState({ loading: true, error: null, bundle: null });
  const [centuryFilter, setCenturyFilter] = useState(null);
  const [periodSize, setPeriodSize] = useState(100);
  const [namesField, setNamesField] = useState('firstNames');
  const [placesKind, setPlacesKind] = useState('birth');
  const [root, setRoot] = useState(null);

  useEffect(() => {
    if (!currentTreeId) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    loadStatsBundle(currentTreeId)
      .then((bundle) => { if (!cancelled) setState({ loading: false, error: null, bundle }); })
      .catch((err) => { if (!cancelled) setState({ loading: false, error: err.message || 'Erreur de chargement.', bundle: null }); });
    return () => { cancelled = true; };
  }, [currentTreeId]);

  const nmdByIndividual = useMemo(() => (state.bundle ? bulkNmdStatus(state.bundle) : null), [state.bundle]);

  const centuries = useMemo(() => {
    if (!state.bundle) return [];
    const set = new Set();
    for (const ind of state.bundle.individuals) {
      if (ind.birthDate) set.add(Math.floor(Number(ind.birthDate.slice(0, 4)) / 100) * 100);
    }
    return [...set].sort((a, b) => a - b);
  }, [state.bundle]);

  const derived = useMemo(() => {
    if (!state.bundle || !nmdByIndividual) return null;
    const { individuals, filiations, unions, partnersByUnion, placesById, events, individualsWithPhoto } = state.bundle;

    const pyramidRows = buildAgePyramid(individuals, centuryFilter != null ? { centuryStart: centuryFilter } : {});
    const lifeExpectancy = lifeExpectancyByPeriod(individuals, periodSize);
    const marriageAge = marriageAgeStats(individuals, unions, partnersByUnion);
    const parenthoodAge = parenthoodAgeStats(individuals, filiations);
    const byDecade = birthsAndDeathsByDecade(individuals);
    const peaks = detectMortalityPeaks(byDecade);
    const peakDecades = new Set(peaks.map((p) => String(p.decade)));
    const names = topNames(individuals, namesField);
    const places = topPlaces(individuals, events, placesById, placesKind);
    const flows = migrationFlows(individuals, placesById);
    const globalCompleteness = completeness(individuals, individualsWithPhoto, nmdByIndividual);
    const distinctSurnames = new Set(individuals.map((i) => i.lastName).filter(Boolean)).size;
    const sexCounts = individuals.reduce((acc, i) => { acc[i.sex === 'M' || i.sex === 'F' ? i.sex : 'U'] += 1; return acc; }, { M: 0, F: 0, U: 0 });
    const globalLifeExpectancy = lifeExpectancyByPeriod(individuals, 1_000_000)[0]?.avgAge ?? null;

    return {
      pyramidRows, lifeExpectancy, marriageAge, parenthoodAge, byDecade, peakDecades, names, places, flows,
      globalCompleteness, distinctSurnames, sexCounts, globalLifeExpectancy,
    };
  }, [state.bundle, nmdByIndividual, centuryFilter, periodSize, namesField, placesKind]);

  const generationGraph = useMemo(
    () => (state.bundle ? buildGenerationGraph(state.bundle.individuals, state.bundle.filiations) : null),
    [state.bundle]
  );
  const byGeneration = useMemo(() => {
    if (!generationGraph || !root || !nmdByIndividual) return null;
    return completenessByGeneration(generationGraph, root.id, state.bundle.individualsWithPhoto, nmdByIndividual);
  }, [generationGraph, root, nmdByIndividual, state.bundle]);

  if (state.loading) return <p className="text-sm text-neutral-400">Chargement des statistiques…</p>;
  if (state.error) return <p className="text-sm text-red-500">{state.error}</p>;
  if (!state.bundle || state.bundle.individuals.length === 0) {
    return <p className="text-sm text-neutral-400">L'arbre est vide pour l'instant — rien à analyser.</p>;
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Statistiques</h1>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">Démographie historique, classements et taux de complétude de l'arbre.</p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Individus" value={state.bundle.individuals.length} />
        <StatTile label="Patronymes distincts" value={derived.distinctSurnames} />
        <StatTile label="Unions" value={state.bundle.unions.length} />
        <StatTile label="Hommes / Femmes" value={`${derived.sexCounts.M} / ${derived.sexCounts.F}`} sub={derived.sexCounts.U ? `${derived.sexCounts.U} non renseigné(s)` : null} />
        <StatTile label="Complétude globale" value={`${derived.globalCompleteness.globalPercent}%`} />
        <StatTile label="Espérance de vie moyenne" value={derived.globalLifeExpectancy != null ? `${derived.globalLifeExpectancy} ans` : '—'} sub="toutes périodes, personnes décédées et datées" />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card title="Pyramide des âges" subtitle="Répartition par tranche de 10 ans et par sexe — à l'âge atteint (décès) ou à l'âge actuel (vivant·e).">
          <div className="mb-2 flex flex-wrap gap-1">
            <button onClick={() => setCenturyFilter(null)} className={`rounded px-2 py-0.5 text-xs ${centuryFilter == null ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>Tous</button>
            {centuries.map((c) => (
              <button key={c} onClick={() => setCenturyFilter(c)} className={`rounded px-2 py-0.5 text-xs ${centuryFilter === c ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
                {c}-{c + 99}
              </button>
            ))}
          </div>
          <AgePyramidChart rows={derived.pyramidRows} />
        </Card>

        <Card title="Espérance de vie" subtitle="Âge moyen au décès, par période de naissance (personnes décédées et datées des deux côtés).">
          <div className="mb-2 flex gap-1">
            <button onClick={() => setPeriodSize(100)} className={`rounded px-2 py-0.5 text-xs ${periodSize === 100 ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>Par siècle</button>
            <button onClick={() => setPeriodSize(10)} className={`rounded px-2 py-0.5 text-xs ${periodSize === 10 ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>Par décennie</button>
          </div>
          <VerticalBars
            data={derived.lifeExpectancy.map((p) => ({ x: String(p.period), values: { avg: p.avgAge } }))}
            series={[{ key: 'avg', label: 'Âge moyen au décès' }]}
            valueSuffix=" ans"
          />
        </Card>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatTile label="Âge moyen au mariage" value={derived.marriageAge.overall != null ? `${derived.marriageAge.overall} ans` : '—'} sub={derived.marriageAge.male != null || derived.marriageAge.female != null ? `H ${derived.marriageAge.male ?? '—'} · F ${derived.marriageAge.female ?? '—'}` : null} />
        <StatTile label="Écart d'âge moyen entre conjoints" value={derived.marriageAge.averageSpouseGap != null ? `${derived.marriageAge.averageSpouseGap} ans` : '—'} />
        <StatTile label="Âge moyen à la paternité" value={derived.parenthoodAge.father != null ? `${derived.parenthoodAge.father} ans` : '—'} sub={derived.parenthoodAge.fatherCount ? `${derived.parenthoodAge.fatherCount} naissances` : null} />
        <StatTile label="Âge moyen à la maternité" value={derived.parenthoodAge.mother != null ? `${derived.parenthoodAge.mother} ans` : '—'} sub={derived.parenthoodAge.motherCount ? `${derived.parenthoodAge.motherCount} naissances` : null} />
      </div>

      <div className="mb-6">
        <Card title="Naissances & décès par décennie" subtitle="Les décennies marquées ⚠ s'écartent nettement de la moyenne des décès (signal statistique, aucune cause n'est déduite).">
          <VerticalBars
            data={derived.byDecade.map((d) => ({ x: String(d.decade), values: { births: d.births, deaths: d.deaths } }))}
            series={[{ key: 'births', label: 'Naissances' }, { key: 'deaths', label: 'Décès' }]}
            markers={derived.peakDecades}
            height={220}
          />
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card title="Top prénoms & patronymes" subtitle="Nombre de personnes portant ce nom, dans tout l'arbre.">
          <div className="mb-2 flex gap-1">
            <button onClick={() => setNamesField('firstNames')} className={`rounded px-2 py-0.5 text-xs ${namesField === 'firstNames' ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>Prénoms</button>
            <button onClick={() => setNamesField('lastName')} className={`rounded px-2 py-0.5 text-xs ${namesField === 'lastName' ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>Patronymes</button>
          </div>
          <RankedBarList
            items={derived.names.map((n) => ({ label: n.name, count: n.count, sub: n.firstYear ? `${n.firstYear} → ${n.lastYear}${n.peakDecade != null ? `, pic ${n.peakDecade}` : ''}` : null }))}
          />
        </Card>

        <Card title="Top lieux" subtitle="Lieux les plus fréquents pour le type d'événement choisi.">
          <div className="mb-2 flex flex-wrap gap-1">
            {[['birth', 'Naissances'], ['death', 'Décès'], ['marriage', 'Mariages']].map(([k, label]) => (
              <button key={k} onClick={() => setPlacesKind(k)} className={`rounded px-2 py-0.5 text-xs ${placesKind === k ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>{label}</button>
            ))}
          </div>
          <RankedBarList items={derived.places} />
        </Card>
      </div>

      <div className="mb-6">
        <Card title="Flux migratoires" subtitle="Trajets naissance → décès les plus fréquents (vue tabulaire ; la carte interactive reste disponible dans l'onglet Carte).">
          <RankedBarList items={derived.flows.map((f) => ({ label: `${f.from} → ${f.to}`, count: f.count }))} emptyLabel="Pas assez de lieux de naissance/décès renseignés pour calculer des flux." />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Complétude — global" subtitle="Part des fiches remplissant chaque critère, sur l'ensemble de l'arbre.">
          <div className="space-y-3">
            <Meter label="Date de naissance exacte" percent={derived.globalCompleteness.criteria.exactBirthDate} />
            <Meter label="Lieu de naissance" percent={derived.globalCompleteness.criteria.birthPlace} />
            <Meter label="Portrait identifié" percent={derived.globalCompleteness.criteria.photo} />
            <Meter label="Acte N/M/D validé" percent={derived.globalCompleteness.criteria.validatedAct} />
          </div>
        </Card>

        <Card title="Complétude — par génération" subtitle="Choisis une personne-racine : les générations sont comptées par rapport à elle (-1 = parents, +1 = enfants…).">
          <div className="mb-3 w-full">
            {root ? (
              <button onClick={() => setRoot(null)} className="flex w-full items-center justify-between rounded-lg border border-accent-200 bg-accent-50 px-3 py-1.5 text-sm text-accent-700 dark:border-accent-800 dark:bg-accent-900/30 dark:text-accent-300">
                {root.name} <span>✕</span>
              </button>
            ) : (
              <IndividualPicker treeId={currentTreeId} placeholder="Choisir une personne-racine…" onSelect={(r) => setRoot({ id: r.id, name: `${r.first_names || ''} ${r.last_name || ''}`.trim() })} />
            )}
          </div>
          {!root ? (
            <p className="text-sm text-neutral-400">Sélectionne une personne pour voir la complétude génération par génération.</p>
          ) : !byGeneration?.length ? (
            <p className="text-sm text-neutral-400">Aucun lien de parenté connu pour cette personne.</p>
          ) : (
            <div className="space-y-2">
              {byGeneration.map((g) => (
                <div key={g.generation} className="flex items-center gap-3">
                  <span className="w-16 flex-none text-xs text-neutral-500 dark:text-neutral-400">
                    {g.generation === 0 ? 'Racine' : g.generation > 0 ? `+${g.generation}` : g.generation}
                  </span>
                  <div className="flex-1"><Meter label={`${g.count} personne${g.count > 1 ? 's' : ''}`} percent={g.globalPercent} /></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
