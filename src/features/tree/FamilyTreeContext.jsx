import { createContext, useCallback, useContext, useMemo, useState } from 'react';
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
  // 'bottomUp' (par défaut) : la racine en bas, parents au-dessus, puis
  // grands-parents plus haut ; 'horizontal' et 'vertical' restent disponibles.
  const [orientation, setOrientation] = useState('bottomUp');
  // Pile des racines précédentes, pour revenir en arrière après un recentrage.
  const [history, setHistory] = useState([]);

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

  const navigateTo = useCallback(
    (id) => {
      if (!id || id === effectiveRootId) return;
      setHistory((h) => (effectiveRootId ? [...h, effectiveRootId] : h));
      setRootId(id);
    },
    [effectiveRootId]
  );

  const goBack = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      setRootId(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);

  const homeIdAvailable = !!(defaultRootIndividualId && graph?.individuals.has(defaultRootIndividualId));
  const goHome = useCallback(() => {
    setHistory([]);
    setRootId(homeIdAvailable ? defaultRootIndividualId : null);
  }, [homeIdAvailable, defaultRootIndividualId]);

  const value = {
    navigateTo,
    goBack,
    goHome,
    canGoBack: history.length > 0,
    canGoHome: homeIdAvailable && effectiveRootId !== defaultRootIndividualId,
    loading,
    error,
    graph,
    reload,
    rootId: effectiveRootId,
    setRootId: navigateTo,
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
