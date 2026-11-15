import { useEffect, useRef, useState } from 'react';
import { yearOptions, daysInMonth, partsToPartialIsoDate, isoDateToPartsFor, MONTH_LABELS } from '../../lib/utils/dateParts.js';

/**
 * Sélecteur de date en 3 listes liées (jour / mois / année) : rend
 * impossible le choix d'une date qui n'existe pas (31 novembre, 29
 * février une année non bissextile) en limitant les jours proposés
 * plutôt qu'en validant après coup, et bloque toute année future.
 *
 * Contrôlé comme un champ classique : `value` est une date ISO
 * ('YYYY-MM-DD') ou vide/null, `onChange` reçoit la nouvelle date ISO
 * ou null tant qu'elle est incomplète.
 *
 * `onChange` ne renvoie une date ISO que lorsque les 3 champs sont
 * complets : tant que l'utilisateur n'a choisi que le jour (ou le
 * jour et le mois), `value` reste null. Le composant garde donc un
 * état local (`parts`) pour ces sélections partielles au lieu de les
 * recalculer depuis `value` à chaque rendu — sinon chaque sélection
 * intermédiaire serait effacée au rendu suivant puisque `value` n'a
 * pas encore changé. Une ref mémorise la dernière valeur ISO émise
 * par le composant lui-même, pour ne resynchroniser l'état local
 * depuis `value` que lors d'un changement venu de l'extérieur (reset
 * du formulaire, changement de fiche) — jamais après notre propre
 * onChange, y compris quand celui-ci efface un jour devenu invalide
 * après un changement de mois/année (ce qui renvoie aussi null).
 *
 * Date partielle : l'année seule (ou le mois et l'année) suffit. Elle
 * est émise au 1er janvier (ou au 1er du mois) et, si `precision` et
 * `onPrecisionChange` sont fournis, la précision passe d'elle-même à
 * "Vers" — c'est elle qui indique que le jour n'est pas connu (voir
 * dateParts.js). Elle revient à sa valeur d'origine si la date est
 * ensuite complétée.
 */
export default function DatePartsInput({ value, onChange, disabled = false, precision, onPrecisionChange }) {
  const [parts, setParts] = useState(() => isoDateToPartsFor(value, precision));
  const autoSwitchedFromRef = useRef(null);
  const lastEmittedRef = useRef(value ?? null);

  useEffect(() => {
    const incoming = value ?? null;
    if (incoming !== lastEmittedRef.current) {
      lastEmittedRef.current = incoming;
      setParts(isoDateToPartsFor(incoming, precision));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // "Exacte" choisie sur une année seule : la date devient le 1er janvier, on l'affiche tel quel.
  useEffect(() => {
    if (value) setParts(isoDateToPartsFor(value, precision));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precision]);

  const years = yearOptions();
  const maxDay = daysInMonth(Number(parts.year) || null, Number(parts.month) || null);

  function update(patch) {
    const next = { ...parts, ...patch };
    const max = daysInMonth(Number(next.year) || null, Number(next.month) || null);
    // Un jour devenu hors limites après un changement de mois/année
    // (ex: 31 choisi, puis mois passé à novembre) est réinitialisé
    // plutôt que laissé sur une valeur désormais invalide.
    if (next.day && Number(next.day) > max) next.day = '';
    setParts(next);
    const { iso, partial } = partsToPartialIsoDate(next);
    lastEmittedRef.current = iso;
    onChange(iso);
    if (!onPrecisionChange) return;
    if (partial && (!precision || precision === 'exact' || precision === 'unknown')) {
      autoSwitchedFromRef.current = precision || 'unknown';
      onPrecisionChange('about');
    } else if (!partial && iso && autoSwitchedFromRef.current && precision === 'about') {
      onPrecisionChange(autoSwitchedFromRef.current);
      autoSwitchedFromRef.current = null;
    }
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
