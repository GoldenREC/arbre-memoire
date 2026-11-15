/**
 * Règle : une personne née il y a plus de 130 ans est considérée comme
 * décédée. La même règle est appliquée en base (supabase/deceased_130.sql),
 * donc toute écriture (formulaire, import, API) donne le même résultat.
 *
 * Les dates attendues sont au format ISO 'YYYY-MM-DD' (une année seule est
 * stockée au 1er janvier, avec la précision « vers »).
 */
export const DECEASED_AFTER_YEARS = 130;

const pad = (n) => String(n).padStart(2, '0');

/** Vrai si la date de naissance (ISO) est antérieure à « aujourd'hui - 130 ans ». */
export function bornMoreThanYearsAgo(birthIso, years = DECEASED_AFTER_YEARS, now = new Date()) {
  if (!birthIso || !/^\d{4}-\d{2}-\d{2}$/.test(birthIso)) return false;
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  cutoff.setFullYear(cutoff.getFullYear() - years);
  const cutoffIso = `${cutoff.getFullYear()}-${pad(cutoff.getMonth() + 1)}-${pad(cutoff.getDate())}`;
  return birthIso < cutoffIso;
}

/** Statut « décédé » effectif : celui saisi, ou imposé par la règle des 130 ans. */
export function effectiveDeceased(isDeceased, birthIso, now = new Date()) {
  return !!isDeceased || bornMoreThanYearsAgo(birthIso, DECEASED_AFTER_YEARS, now);
}
