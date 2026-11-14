import { createContext, useContext, useMemo, useState } from 'react';
import { useFamilyGraph } from './useFamilyGraph.js';
import { useAuthStore } from '../../store/useAuthStore.js';

const FamilyTreeContext = createContext(null);

/**
 * Contexte partagé par les trois vues (Ascendance / Descendance /
 * Éventail) : même graphe de données, même individu racine, mêmes
 * réglages de profondeur — c'est ce qui les rend "interconnectées"
 * (changer de racine dans une vue se reflète dans les autres).
 */
export function FamilyTreeProvider({ treeId, children }) {
  const { loading, error, graph, reload } = useFamilyGraph(treeId);
  const defaultRootIndividualId = useAuthStore((s) => s.preferences?.defaultRootIndividualId);
  const [rootId, setRootId] = useState(null);
  const [generations, setGenerations] = useState(5);
  // 'horizontal' (gauche → droite, par défaut) ou 'vertical' (haut → bas) —
  // ne concerne que la vue Ascendance (voir AscendancyView.jsx) ; partagé
  // ici pour que le choix survive si l'utilisateur change d'onglet.
  const [orientation, setOrientation] = useState('horizontal');

  // Dès que le graphe est chargé, on choisit une racine par défaut si
  // aucune n'a encore été choisie dans cette session : la fiche "De
  // Cujus" personnelle du membre (voir Paramètres → Préférences) si
  // elle est définie et existe encore dans l'arbre, sinon le premier
  // individu par ordre alphabétique de nom de famille.
  const effectiveRootId = useMemo(() => {
    if (rootId && graph?.individuals.has(rootId)) return rootId;
    if (!graph) return null;
    if (defaultRootIndividualId && graph.individuals.has(defaultRootIndividualId)) return defaultRootIndividualId;
    const first = [...graph.individuals.values()].sort((a, b) =>
      (a.lastName || '').localeCompare(b.lastName || '')
    )[0];
    return first?.id ?? null;
  }, [rootId, graph, defaultRootIndividualId]);

  const value = {
    loading,
    error,
    graph,
    reload,
    rootId: effectiveRootId,
    setRootId,
    generations,
    setGenerations,
    orientation,
    setOrientation,
  };

  return <FamilyTreeContext.Provider value={value}>{children}</FamilyTreeContext.Provider>;
}

export function useFamilyTree() {
  const ctx = useContext(FamilyTreeContext);
  if (!ctx) throw new Error('useFamilyTree doit être utilisé à l\'intérieur de <FamilyTreeProvider>.');
  return ctx;
}
