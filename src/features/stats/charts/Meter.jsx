import { SEQUENTIAL, useChartMode } from '../chartColors.js';

/** Jauge de progression simple (taux de complétude) : une seule teinte séquentielle, piste neutre, pourcentage toujours affiché en texte. */
export default function Meter({ label, percent, count }) {
  const mode = useChartMode();
  const fill = SEQUENTIAL[mode][450];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-neutral-600 dark:text-neutral-300">{label}</span>
        <span className="font-medium text-neutral-800 dark:text-neutral-100">
          {percent}%{count != null && <span className="ml-1 text-neutral-400">({count})</span>}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, percent)}%`, background: fill }} />
      </div>
    </div>
  );
}
