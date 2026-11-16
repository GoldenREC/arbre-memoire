/**
 * Hiérarchie des liens parentaux quand un enfant a plusieurs parents.
 * Du plus fort au plus faible : adoption plénière, biologique, adoption
 * simple, famille d'accueil / inconnu. Le lien le plus fort est le parent
 * « principal » (ascendance, export GEDCOM). À égalité, l'ordre de saisie
 * est conservé.
 */
export const FILIATION_RANK = {
  adoption_plenary: 4,
  biological: 3,
  biological_unrecognized: 3,
  late_recognition: 3,
  adoption_simple: 2,
  abandoned: 2,
  foster: 1,
  unknown: 1,
};

export function filiationRank(type) {
  return FILIATION_RANK[type] ?? 0;
}

/** Liens triés du plus fort au plus faible (copie, l'original n'est pas modifié). */
export function rankParentLinks(links) {
  return [...links].sort((a, b) => filiationRank(b.filiationType) - filiationRank(a.filiationType));
}
