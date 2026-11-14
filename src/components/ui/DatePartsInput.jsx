import { yearOptions, daysInMonth, partsToIsoDate, isoDateToParts, MONTH_LABELS } from '../../lib/utils/dateParts.js';

/**
 * Sélecteur de date en 3 listes liées (jour / mois / année) : rend
 * impossible le choix d'une date qui n'existe pas (31 novembre, 29
 * février une année non bissextile) en limitant les jours proposés
 * plutôt qu'en validant après coup, et bloque toute année future.
 *
 * Contrôlé comme un champ classique : `value` est une date ISO
 * ('YYYY-MM-DD') ou vide/null, `onChange` reçoit la nouvelle date ISO
 * ou null tant qu'elle est incomplète.
 */
export default function DatePartsInput({ value, onChange, disabled = false }) {
  const parts = isoDateToParts(value);
  const years = yearOptions();
  const maxDay = daysInMonth(Number(parts.year) || null, Number(parts.month) || null);

  function update(patch) {
    const next = { ...parts, ...patch };
    const max = daysInMonth(Number(next.year) || null, Number(next.month) || null);
    // Un jour devenu hors limites après un changement de mois/année
    // (ex: 31 choisi, puis mois passé à novembre) est réinitialisé
    // plutôt que laissé sur une valeur désormais invalide.
    if (next.day && Number(next.day) > max) next.day = '';
    onChange(partsToIsoDate(next));
  }

  return (
    <div className="flex gap-1.5">
      <select
        className="field"
        aria-label="Jour"
        disabled={disabled}
        value={parts.day}
        onChange={(e) => update({ day: e.target.value })}
      >
        <option value="">Jour</option>
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <select
        className="field"
        aria-label="Mois"
        disabled={disabled}
        value={parts.month}
        onChange={(e) => update({ month: e.target.value })}
      >
        <option value="">Mois</option>
        {MONTH_LABELS.map((label, i) => (
          <option key={i + 1} value={i + 1}>{label}</option>
        ))}
      </select>
      <select
        className="field"
        aria-label="Année"
        disabled={disabled}
        value={parts.year}
        onChange={(e) => update({ year: e.target.value })}
      >
        <option value="">Année</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
