import { SEQUENTIAL, useChartMode } from '../chartColors.js';

/**
 * Liste classée avec barre proportionnelle (top prénoms, top lieux,
 * flux migratoires). `items`: [{ label, count, sub? }] déjà triés ;
 * `sub` est un détail secondaire optionnel (ex. "1850 → 1920").
 */
export default function RankedBarList({ items, emptyLabel = 'Aucune donnée.' }) {
  const mode = useChartMode();
  const fill = SEQUENTIAL[mode][300];

  if (!items.length) return <p className="text-sm text-neutral-400">{emptyLabel}</p>;
  const max = Math.max(1, ...items.map((i) => i.count));

  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={`${item.label}-${i}`} className="flex items-center gap-2 text-sm">
          <span className="w-28 flex-none truncate text-neutral-600 dark:text-neutral-300" title={item.label}>{item.label}</span>
          <span className="relative flex-1">
            <span className="block h-4 rounded" style={{ width: `${(item.count / max) * 100}%`, background: fill, minWidth: 2 }} />
          </span>
          <span className="w-10 flex-none text-right text-neutral-500 dark:text-neutral-400">{item.count}</span>
          {item.sub && <span className="w-24 flex-none truncate text-xs text-neutral-400">{item.sub}</span>}
        </li>
      ))}
    </ul>
  );
}
