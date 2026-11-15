/**
 * Dates partielles dans un JSON d'import : "1829" (année seule) et
 * "1829-03" (mois + année) sont acceptées et ramenées au format stocké
 * — 1er janvier ou 1er du mois, avec une précision qui n'est jamais
 * "exacte" (voir lib/utils/dateParts.js). Modifie le modèle en place.
 */
const YEAR_RE = /^\d{4}$/;
const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Renvoie { date, precision } normalisés pour une date éventuellement partielle. */
export function normalizePartialDate(date, precision) {
  // Certaines IA écrivent l'année comme un nombre (1829) plutôt qu'un texte ("1829").
  if (typeof date !== 'string' && typeof date !== 'number') return { date, precision };
  const value = String(date).trim();
  let full = null;
  if (YEAR_RE.test(value)) full = `${value}-01-01`;
  else if (YEAR_MONTH_RE.test(value)) full = `${value}-01`;
  if (!full) return { date, precision };
  return { date: full, precision: !precision || precision === 'exact' || precision === 'unknown' ? 'about' : precision };
}

function fixFact(fact) {
  if (!fact || typeof fact !== 'object') return;
  const { date, precision } = normalizePartialDate(fact.date, fact.datePrecision);
  if (date !== fact.date) { fact.date = date; fact.datePrecision = precision; }
}

function fixPair(obj, dateKey, precisionKey) {
  const { date, precision } = normalizePartialDate(obj[dateKey], obj[precisionKey]);
  if (date !== obj[dateKey]) { obj[dateKey] = date; obj[precisionKey] = precision; }
}

export function normalizeImportDates(model) {
  if (!model || typeof model !== 'object') return model;
  if (model.act && typeof model.act === 'object') {
    const { date } = normalizePartialDate(model.act.date, 'about');
    model.act.date = date;
  }
  for (const ind of Array.isArray(model.individuals) ? model.individuals : []) {
    if (!ind || typeof ind !== 'object') continue;
    fixFact(ind.birth);
    fixFact(ind.death);
    for (const ev of Array.isArray(ind.events) ? ind.events : []) fixFact(ev);
  }
  for (const u of Array.isArray(model.unions) ? model.unions : []) {
    if (!u || typeof u !== 'object') continue;
    fixPair(u, 'startDate', 'startDatePrecision');
    fixPair(u, 'endDate', 'endDatePrecision');
    fixFact(u.marriage);
  }
  return model;
}
