/**
 * Palette de couleurs stable par nom de famille (lignée patronymique),
 * utilisée par la vue Descendance. Les classes sont écrites en toutes
 * lettres (et non construites dynamiquement) pour que Tailwind les
 * détecte à la compilation.
 */
// `hex` reprend la même teinte que `dot` (ex: sky-400) pour les rendus
// SVG (fan chart), où un attribut `fill` a besoin d'une vraie couleur
// et non d'une classe Tailwind.
const PALETTE = [
  { badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300', dot: 'bg-sky-400', hex: '#38bdf8' },
  { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', dot: 'bg-amber-400', hex: '#fbbf24' },
  { badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', dot: 'bg-emerald-400', hex: '#34d399' },
  { badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', dot: 'bg-violet-400', hex: '#a78bfa' },
  { badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300', dot: 'bg-rose-400', hex: '#fb7185' },
  { badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300', dot: 'bg-teal-400', hex: '#2dd4bf' },
];

export function branchColor(lastName) {
  if (!lastName) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < lastName.length; i++) {
    hash = (hash * 31 + lastName.charCodeAt(i)) % PALETTE.length;
  }
  return PALETTE[hash];
}
