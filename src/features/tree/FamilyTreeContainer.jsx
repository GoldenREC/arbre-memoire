import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore.js';
import { FamilyTreeProvider, useFamilyTree } from './FamilyTreeContext.jsx';
import AscendancyView from './AscendancyView.jsx';
import DescendancyView from './DescendancyView.jsx';
import FanChartView from './FanChartView.jsx';
import CoupleView from './CoupleView.jsx';

const TABS = [
  { key: 'ascendance', label: 'Ascendance' },
  { key: 'descendance', label: 'Descendance' },
  { key: 'eventail', label: 'Éventail' },
  { key: 'couples', label: 'Couples' },
];

/**
 * Point d'entrée de la section "Arbre généalogique" : fournit le
 * contexte partagé (graphe + individu racine + profondeur) aux trois
 * vues, qui restent ainsi interconnectées — changer de racine ou de
 * profondeur dans un onglet se répercute sur les autres.
 */
export default function FamilyTreeContainer() {
  const { currentTreeId } = useAuthStore();

  if (!currentTreeId) {
    return <p className="text-sm text-neutral-400">Aucun arbre sélectionné.</p>;
  }

  return (
    <FamilyTreeProvider treeId={currentTreeId}>
      <FamilyTreeExplorer />
    </FamilyTreeProvider>
  );
}

function FamilyTreeExplorer() {
  const { loading, error, graph, rootId, setRootId, generations, setGenerations, orientation, setOrientation, goBack, goHome, canGoBack, canGoHome } = useFamilyTree();
  const [tab, setTab] = useState('ascendance');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const openIndividual = (individualId) => navigate(`/individus/${individualId}`);

  if (loading) return <p className="text-sm text-neutral-400">Chargement de l'arbre…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  if (!graph || graph.individuals.size === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
        Ton arbre est vide pour le moment. Importe un fichier GEDCOM pour voir apparaître l'arbre interactif.
      </div>
    );
  }

  const matches =
    search.length >= 2
      ? [...graph.individuals.values()]
          .filter((i) => `${i.firstNames || ''} ${i.lastName || ''}`.toLowerCase().includes(search.toLowerCase()))
          .slice(0, 8)
      : [];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Arbre généalogique</h1>

        <div className="relative ml-auto w-64">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Changer d'individu racine…"
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          {matches.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => {
                      setRootId(m.id);
                      setSearch('');
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    {m.firstNames} {m.lastName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          Générations
          <input
            type="range"
            min={2}
            max={6}
            value={generations}
            onChange={(e) => setGenerations(Number(e.target.value))}
          />
          <span className="w-4 text-center">{generations}</span>
        </label>

        <div className="flex items-center gap-1 text-xs">
          <button onClick={goBack} disabled={!canGoBack} title="Revenir à la personne précédente" className="rounded bg-neutral-100 px-2 py-1 text-neutral-600 disabled:opacity-40 dark:bg-neutral-800 dark:text-neutral-300">
            ← Retour
          </button>
          <button onClick={goHome} disabled={!canGoHome} title="Revenir à la fiche racine par défaut" className="rounded bg-neutral-100 px-2 py-1 text-neutral-600 disabled:opacity-40 dark:bg-neutral-800 dark:text-neutral-300">
            ⌂ Fiche racine
          </button>
        </div>

        {tab === 'ascendance' && (
          <div className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
            <button
              onClick={() => setOrientation('bottomUp')}
              title="Racine en bas, parents au-dessus"
              className={`rounded px-2 py-1 ${orientation === 'bottomUp' ? 'bg-accent-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800'}`}
            >
              ⇡ Racine en bas
            </button>
            <button
              onClick={() => setOrientation('horizontal')}
              title="Orientation gauche → droite"
              className={`rounded px-2 py-1 ${orientation === 'horizontal' ? 'bg-accent-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800'}`}
            >
              ↔ Gauche → droite
            </button>
            <button
              onClick={() => setOrientation('vertical')}
              title="Orientation haut → bas"
              className={`rounded px-2 py-1 ${orientation === 'vertical' ? 'bg-accent-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800'}`}
            >
              ↕ Haut → bas
            </button>
          </div>
        )}
      </div>

      <div className="mb-4 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-accent-600 text-accent-700 dark:text-accent-300'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'ascendance' && <AscendancyView onOpenIndividual={openIndividual} />}
        {tab === 'descendance' && <DescendancyView onOpenIndividual={openIndividual} />}
        {tab === 'eventail' && <FanChartView onOpenIndividual={openIndividual} />}
        {tab === 'couples' && <CoupleView onOpenIndividual={openIndividual} />}
      </div>
    </div>
  );
}
