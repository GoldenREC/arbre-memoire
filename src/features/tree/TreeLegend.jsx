import { FILIATION_STYLE, unionStyle } from './filiationStyle.js';

const FILIATION_ITEMS = [
  ['biological', 'Biologique déclaré·e'],
  ['adoption_plenary', 'Adoption plénière'],
  ['adoption_simple', 'Adoption simple'],
  ['late_recognition', 'Reconnaissance tardive'],
  ['foster', "Famille d'accueil"],
  ['biological_unrecognized', 'Biologique non déclaré·e'],
];

const UNION_ITEMS = [
  [{ status: 'ongoing', unionType: 'marriage' }, 'Marié·e ou en couple officiel'],
  [{ status: 'ongoing', unionType: 'cohabitation' }, 'Concubinage'],
  [{ status: 'divorced', unionType: 'marriage' }, 'Divorcé·e ou séparé·e'],
];

function Sample({ color, dash, width = 2 }) {
  return (
    <svg width="36" height="10" className="shrink-0">
      <line x1="0" y1="5" x2="36" y2="5" stroke={color} strokeWidth={width} strokeDasharray={dash} />
    </svg>
  );
}

/** Légende en bas de l'arbre : union entre conjoints et type de lien parent/enfant. */
export default function TreeLegend() {
  return (
    <div className="mt-3 grid gap-x-6 gap-y-2 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-xs text-neutral-600 sm:grid-cols-2 xl:grid-cols-3 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
      <div>
        <p className="mb-1.5 font-semibold text-neutral-800 dark:text-neutral-100">Union entre conjoints</p>
        <ul className="space-y-1.5">
          {UNION_ITEMS.map(([u, label]) => {
            const s = unionStyle(u.status, u.unionType);
            return (
              <li key={label} className="flex items-center gap-2">
                <Sample color={s.color} dash={s.dash} width={2.5} />
                {label}
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <p className="mb-1.5 font-semibold text-neutral-800 dark:text-neutral-100">Lien parent → enfant</p>
        <ul className="space-y-1.5">
          {FILIATION_ITEMS.map(([key, label]) => {
            const s = FILIATION_STYLE[key];
            return (
              <li key={key} className="flex items-center gap-2">
                <Sample color={s.color} dash={s.dash} />
                {label}
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <p className="mb-1.5 font-semibold text-neutral-800 dark:text-neutral-100">Commandes</p>
        <ul className="space-y-1.5">
          <li>Molette ou boutons + / − : zoom</li>
          <li>Glisser : déplacer l'arbre</li>
          <li>Clic sur une carte : la centrer</li>
          <li>🔍 sur une carte : ouvrir sa fiche</li>
        </ul>
      </div>
    </div>
  );
}
