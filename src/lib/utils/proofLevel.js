/**
 * Indice de preuve (fiabilité), rattaché à chaque événement
 * (`events.proof_level`). Centralisé ici car utilisé à la fois par la
 * fiche individu (Timeline, formulaire d'événement) et par le
 * gestionnaire de sources (liste des citations d'une source).
 */
export const PROOF_LEVELS = [
  { value: 'proven_original', label: 'Prouvé par acte original', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', hex: '#34d399' },
  { value: 'proven_secondary', label: 'Source secondaire', badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300', hex: '#38bdf8' },
  { value: 'probable', label: 'Probable', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', hex: '#fbbf24' },
  { value: 'hypothesis', label: 'Hypothèse / à vérifier', badge: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300', hex: '#a3a3a3' },
  { value: 'disproved', label: 'Réfuté', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', hex: '#f87171' },
];

export const PROOF_LEVEL_LABELS = Object.fromEntries(PROOF_LEVELS.map((p) => [p.value, p.label]));

export function proofLevelBadgeClass(value) {
  return PROOF_LEVELS.find((p) => p.value === value)?.badge || PROOF_LEVELS[3].badge;
}

/** Couleur hexadécimale associée à un indice de preuve (marqueurs de carte, SVG...). */
export function proofLevelHex(value) {
  return PROOF_LEVELS.find((p) => p.value === value)?.hex || PROOF_LEVELS[3].hex;
}
