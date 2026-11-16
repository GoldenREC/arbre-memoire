import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient.js';

/**
 * Charge tout le graphe généalogique d'un arbre (individus, filiations,
 * unions) et expose des index (Map) pour une navigation O(1) : utilisé
 * par les trois vues d'arbre (ascendance, descendance, éventail) via le
 * hook useFamilyGraph ci-dessous, et par les exporteurs (GEDCOM, JSON,
 * PDF) qui tournent hors React et ont besoin de la même fonction pure.
 *
 * Pour la taille d'un arbre familial (quelques centaines à quelques
 * milliers d'individus), charger l'ensemble en mémoire au premier accès
 * est largement suffisant et évite une cascade de requêtes par noeud.
 */
export async function loadFamilyGraph(treeId) {
  const [{ data: individualsRows, error: e1 }, { data: filiationRows, error: e2 }, { data: unionRows, error: e3 }, { data: partnerRows, error: e4 }] =
    await Promise.all([
      supabase
        .from('individuals')
        .select('id, first_names, last_name, nickname, occupation, sex, birth_date, birth_date_precision, death_date, death_date_precision, is_deceased')
        .eq('tree_id', treeId),
      supabase.from('filiations').select('child_id, parent_id, union_id, filiation_type').eq('tree_id', treeId),
      supabase.from('unions').select('id, union_type, status, start_date, start_date_precision').eq('tree_id', treeId),
      supabase
        .from('union_partners')
        .select('union_id, individual_id, unions!inner(tree_id)')
        .eq('unions.tree_id', treeId),
    ]);

  const firstError = e1 || e2 || e3 || e4;
  if (firstError) throw firstError;

  const individuals = new Map();
  for (const row of individualsRows || []) {
    individuals.set(row.id, {
      id: row.id,
      firstNames: row.first_names,
      lastName: row.last_name,
      nickname: row.nickname,
      occupation: row.occupation,
      sex: row.sex,
      birthDate: row.birth_date,
      birthDatePrecision: row.birth_date_precision,
      deathDate: row.death_date,
      deathDatePrecision: row.death_date_precision,
      isDeceased: row.is_deceased,
    });
  }

  const unions = new Map();
  for (const row of unionRows || []) {
    unions.set(row.id, {
      id: row.id,
      unionType: row.union_type,
      status: row.status,
      startDate: row.start_date,
      startDatePrecision: row.start_date_precision,
      partnerIds: [],
    });
  }
  for (const row of partnerRows || []) {
    unions.get(row.union_id)?.partnerIds.push(row.individual_id);
  }

  // child_id -> [{ parentId, unionId, filiationType }]
  const parentsOf = new Map();
  // parent_id -> [childId]
  const childrenOf = new Map();
  for (const row of filiationRows || []) {
    if (!parentsOf.has(row.child_id)) parentsOf.set(row.child_id, []);
    parentsOf.get(row.child_id).push({
      parentId: row.parent_id,
      unionId: row.union_id,
      filiationType: row.filiation_type,
    });

    // Un même couple parent/enfant peut avoir plusieurs liens (un par type) :
    // l'arbre ne doit compter l'enfant qu'une fois.
    if (!childrenOf.has(row.parent_id)) childrenOf.set(row.parent_id, []);
    if (!childrenOf.get(row.parent_id).includes(row.child_id)) childrenOf.get(row.parent_id).push(row.child_id);
  }

  // individual_id -> [unionId]
  const unionsOf = new Map();
  for (const union of unions.values()) {
    for (const partnerId of union.partnerIds) {
      if (!unionsOf.has(partnerId)) unionsOf.set(partnerId, []);
      unionsOf.get(partnerId).push(union.id);
    }
  }

  return {
    individuals,
    unions,
    parentsOf,
    childrenOf,
    unionsOf,
    getIndividual: (id) => individuals.get(id) || null,
    // Un parent par couple : le premier lien trouvé sert à l'arbre.
    getParents: (id) => {
      const seen = new Set();
      return (parentsOf.get(id) || []).filter((p) => (seen.has(p.parentId) ? false : seen.add(p.parentId)));
    },
    getChildren: (id) => childrenOf.get(id) || [],
    getUnions: (id) => (unionsOf.get(id) || []).map((uid) => unions.get(uid)),
    getSpouses: (id) =>
      (unionsOf.get(id) || [])
        .flatMap((uid) => unions.get(uid)?.partnerIds || [])
        .filter((pid) => pid !== id),
  };
}

export function useFamilyGraph(treeId) {
  const [state, setState] = useState({ loading: true, error: null, graph: null });

  const reload = useCallback(async () => {
    if (!treeId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const graph = await loadFamilyGraph(treeId);
      setState({ loading: false, error: null, graph });
    } catch (err) {
      console.error(err);
      setState({ loading: false, error: err.message || "Impossible de charger l'arbre.", graph: null });
    }
  }, [treeId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}
