/**
 * Classement des sources pour les filtres du gestionnaire de sources :
 * par type de preuve (acte / mention marginale / information familiale)
 * et par type d'événement prouvé (naissance / mariage / décès / autre).
 * Fonctions pures, testables sans Supabase.
 */

export const PROOF_KIND_LABELS = {
  acte: 'Acte',
  marginal: 'Mention marginale',
  family: 'Information familiale',
  other: 'Non classée',
};

export const EVENT_CATEGORY_LABELS = {
  birth: 'Naissance',
  marriage: 'Mariage',
  death: 'Décès',
  other: 'Autre',
};

/**
 * Type de preuve d'une source. Une mention marginale est enregistrée
 * comme un acte (c'est un acte qui la porte) et se reconnaît à son titre
 * "Mention marginale — …", donné par le formulaire d'union.
 */
export function proofKindOf(source) {
  if (source.source_type === 'family_data') return 'family';
  if (/^\s*mention marginale/i.test(source.title || '')) return 'marginal';
  if (source.source_type === 'civil_record' || source.source_type === 'archive_permalink') return 'acte';
  return 'other';
}

/**
 * Catégories d'événements qu'une source prouve (une source peut en
 * prouver plusieurs). "Autre" regroupe tout le reste — mise en couple,
 * divorce, baptême, résidence... — ainsi que les sources qui ne sont
 * rattachées à aucun événement.
 */
export function eventCategoriesOf(source) {
  const categories = new Set();
  for (const type of source.eventTypes || []) {
    categories.add(type === 'birth' || type === 'marriage' || type === 'death' ? type : 'other');
  }
  if (categories.size === 0) categories.add('other');
  return [...categories];
}

export function filterSources(sources, { search = '', proofKind = 'all', eventCategory = 'all' } = {}) {
  const needle = search.trim().toLowerCase();
  return sources.filter((s) => {
    if (needle && !`${s.title} ${s.repository || ''} ${s.call_number || ''} ${(s.subjects || []).join(' ')}`.toLowerCase().includes(needle)) return false;
    if (proofKind !== 'all' && proofKindOf(s) !== proofKind) return false;
    if (eventCategory !== 'all' && !eventCategoriesOf(s).includes(eventCategory)) return false;
    return true;
  });
}

/** Nombre de sources par valeur de chaque filtre, pour l'afficher sur les boutons. */
export function countSourcesByFilter(sources) {
  const proofKind = { acte: 0, marginal: 0, family: 0, other: 0 };
  const eventCategory = { birth: 0, marriage: 0, death: 0, other: 0 };
  for (const s of sources) {
    proofKind[proofKindOf(s)] += 1;
    for (const c of eventCategoriesOf(s)) eventCategory[c] += 1;
  }
  return { proofKind, eventCategory };
}
