/**
 * Hiérarchie des liens parentaux quand un enfant a plusieurs parents, du plus
 * fort au plus faible : adoption plénière, biologique déclaré(e), reconnaissance
 * tardive, adoption simple, biologique non déclaré(e), abandonné(e), famille
 * d'accueil. « Inconnu » reste en dernier. Le lien le plus fort est le parent
 * principal (ascendance, export GEDCOM). À égalité, l'ordre de saisie est conservé.
 */
export const FILIATION_RANK = {
  adoption_plenary: 7,
  biological: 6,
  late_recognition: 5,
  adoption_simple: 4,
  biological_unrecognized: 3,
  abandoned: 2,
  foster: 1,
  unknown: 0,
};

export function filiationRank(type) {
  return FILIATION_RANK[type] ?? 0;
}

/** Liens triés du plus fort au plus faible (copie, l'original n'est pas modifié). */
export function rankParentLinks(links) {
  return [...links].sort((a, b) => filiationRank(b.filiationType) - filiationRank(a.filiationType));
}
