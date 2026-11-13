/**
 * Formatage de dates "généalogiques" : une date peut être exacte,
 * approximative, avant/après une borne, ou totalement inconnue.
 */
export function formatGenealogyDate({ date, datePrecision, dateEnd } = {}) {
  if (!date && datePrecision !== 'between') return '?';

  const formatted = date ? formatDateFr(date) : '?';

  switch (datePrecision) {
    case 'about':
      return `vers ${formatted}`;
    case 'before':
      return `avant ${formatted}`;
    case 'after':
      return `après ${formatted}`;
    case 'between':
      return `entre ${formatted} et ${dateEnd ? formatDateFr(dateEnd) : '?'}`;
    case 'exact':
      return formatted;
    default:
      return formatted;
  }
}

function formatDateFr(isoDate) {
  const [year, month, day] = isoDate.split('-');
  const months = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
  ];
  const monthLabel = months[parseInt(month, 10) - 1] || '';
  if (day === '01' && !monthLabel) return year;
  return `${parseInt(day, 10)} ${monthLabel} ${year}`.trim();
}

function formatDateNumeric(isoDate, dateFormat) {
  const [year, month, day] = isoDate.split('-');
  return dateFormat === 'ymd' ? `${year}-${month}-${day}` : `${day}/${month}/${year}`;
}

/**
 * Variante numérique de formatGenealogyDate (JJ/MM/AAAA ou AAAA-MM-JJ
 * selon la préférence du membre — voir Paramètres → Préférences,
 * tree_members.date_format) : utilisée sur les cases de l'arbre
 * (PersonCard) ; le reste de l'application garde le format littéral
 * français habituel.
 */
export function formatGenealogyDateWithPref({ date, datePrecision, dateEnd } = {}, dateFormat = 'dmy') {
  if (!date && datePrecision !== 'between') return '?';
  const formatted = date ? formatDateNumeric(date, dateFormat) : '?';

  switch (datePrecision) {
    case 'about':
      return `vers ${formatted}`;
    case 'before':
      return `avant ${formatted}`;
    case 'after':
      return `après ${formatted}`;
    case 'between':
      return `entre ${formatted} et ${dateEnd ? formatDateNumeric(dateEnd, dateFormat) : '?'}`;
    default:
      return formatted;
  }
}

/** Âge en années pleines à une date donnée (ou aujourd'hui). */
export function computeAge(birthDate, atDate = new Date()) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const at = typeof atDate === 'string' ? new Date(atDate) : atDate;
  let age = at.getFullYear() - birth.getFullYear();
  const monthDiff = at.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && at.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
