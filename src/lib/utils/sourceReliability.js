/**
 * Types de source acceptés (Paramètres... non, directement dans le
 * gestionnaire de sources — voir SourceDetailModal.jsx) et détection
 * des sites d'arbres généalogiques collaboratifs (Geneanet, MyHeritage,
 * Ancestry, FamilySearch...) : leurs pages ne sont pas des preuves
 * primaires, ce sont elles-mêmes des compilations faites par d'autres
 * utilisateurs, potentiellement erronées ou simplement recopiées d'un
 * arbre à l'autre (exactement le genre de source que ce site ne veut
 * pas voir citée comme preuve). Liste volontairement explicite plutôt
 * qu'une détection plus "intelligente" : mieux vaut laisser passer un
 * cas limite que bloquer à tort un vrai permalien d'archive.
 */

export const SOURCE_TYPES = [
  { value: 'archive_permalink', label: "Permalien d'archive" },
  { value: 'civil_record', label: 'Acte (état civil, paroissial, notarié...)' },
  { value: 'family_data', label: 'Donnée familiale (témoignage, document personnel...)' },
];

export const SOURCE_TYPE_LABELS = Object.fromEntries(SOURCE_TYPES.map((t) => [t.value, t.label]));

const UNRELIABLE_DOMAINS = [
  'geneanet.org',
  'myheritage.com', 'myheritage.fr',
  'ancestry.com', 'ancestry.fr', 'ancestry.co.uk', 'ancestry.de',
  'familysearch.org',
  'filae.com',
  'genealogieonline.nl',
  'wikitree.com',
  'rootsweb.com',
  'genealogy.com',
];

/**
 * true si l'URL pointe vers un arbre généalogique collaboratif connu
 * (donc pas une source fiable au sens de ce site). Une URL absente ou
 * invalide renvoie false — ce n'est pas à cette fonction de signaler
 * un format d'URL incorrect.
 */
export function isUnreliableSourceUrl(url) {
  if (!url) return false;
  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }
  return UNRELIABLE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}
