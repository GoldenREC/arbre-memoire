/**
 * Utilitaires pour le sélecteur de date en 3 listes (jour/mois/année) —
 * voir components/ui/DatePartsInput.jsx. Rendent impossible la
 * sélection d'une date qui n'existe pas (31 novembre, 29 février une
 * année non bissextile) en limitant la liste des jours proposés plutôt
 * qu'en validant après coup, et bloquent toute année future.
 */

export const MIN_GENEALOGY_YEAR = 1500;

export const MONTH_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/** Années sélectionnables, de la plus récente à la plus ancienne (pour l'affichage dans le <select>). */
export function yearOptions(maxYear = new Date().getFullYear()) {
  const years = [];
  for (let y = maxYear; y >= MIN_GENEALOGY_YEAR; y--) years.push(y);
  return years;
}

/**
 * Nombre de jours du mois donné (1-12) pour l'année donnée — gère les
 * années bissextiles via le "jour 0 du mois suivant", qui retombe
 * toujours sur le dernier jour du mois demandé.
 */
export function daysInMonth(year, month) {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

/** Compose {day, month, year} (nombres ou chaînes, mois en 1-12) en date ISO 'YYYY-MM-DD', ou null si incomplet/invalide. */
export function partsToIsoDate({ day, month, year }) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > daysInMonth(y, m)) return null;
  if (y > new Date().getFullYear()) return null;
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/** Décompose une date ISO 'YYYY-MM-DD' en {day, month, year} (nombres), ou des champs vides si null/invalide. */
export function isoDateToParts(iso) {
  if (!iso) return { day: '', month: '', year: '' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return { day: '', month: '', year: '' };
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}
