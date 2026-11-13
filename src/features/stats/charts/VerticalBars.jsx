import { CATEGORICAL, GRID, useChartMode } from '../chartColors.js';

/**
 * Graphique en barres verticales, une ou deux séries, le long d'un axe
 * discret (décennies, siècles…). Étiquettes de valeur au-dessus de
 * chaque barre (jamais seulement la hauteur à comparer à l'oeil),
 * légende si plusieurs séries, infobulle native au survol.
 *
 * `data`: [{ x: string, values: { [seriesKey]: number|null } }]
 * `series`: [{ key, label }]
 * `markers`: Set de x à signaler (ex. pics de mortalité) — affiche une
 * puce au-dessus de la barre concernée plutôt que de recolorer la série.
 */
export default function VerticalBars({ data, series, height = 200, markers = null, valueSuffix = '' }) {
  const mode = useChartMode();
  const colors = CATEGORICAL[mode];
  const grid = GRID[mode];

  if (!data.length) return <p className="text-sm text-neutral-400">Pas assez de données.</p>;

  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d.values[s.key] || 0)));
  const barGroupWidth = 100 / data.length;
  const barWidth = Math.min(28, (barGroupWidth * 0.7) / series.length);

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 flex gap-4 text-xs text-neutral-500 dark:text-neutral-400">
          {series.map((s, i) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colors[i] }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 100 ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        <line x1="0" y1={height - 20} x2="100" y2={height - 20} stroke={grid} strokeWidth="0.5" />
        {data.map((d, gi) => {
          const groupX = gi * barGroupWidth;
          const isMarked = markers?.has(d.x);
          return (
            <g key={d.x}>
              {series.map((s, si) => {
                const value = d.values[s.key] || 0;
                const barH = (value / max) * (height - 34);
                const x = groupX + barGroupWidth / 2 - (barWidth * series.length) / 2 + si * barWidth;
                const y = height - 20 - barH;
                return (
                  <g key={s.key}>
                    <rect x={x} y={y} width={barWidth * 0.85} height={barH} rx="1.5" fill={colors[si]}>
                      <title>{`${d.x} — ${s.label} : ${value}${valueSuffix}`}</title>
                    </rect>
                    {value > 0 && (
                      <text x={x + (barWidth * 0.85) / 2} y={y - 2} textAnchor="middle" fontSize="4.5" className="fill-neutral-500 dark:fill-neutral-400">
                        {value}
                      </text>
                    )}
                  </g>
                );
              })}
              {isMarked && (
                <text x={groupX + barGroupWidth / 2} y={height - 24 - (Math.max(...series.map((s) => d.values[s.key] || 0)) / max) * (height - 34)} textAnchor="middle" fontSize="6">
                  ⚠
                </text>
              )}
              <text x={groupX + barGroupWidth / 2} y={height - 9} textAnchor="middle" fontSize="4.5" className="fill-neutral-500 dark:fill-neutral-400">
                {d.x}
              </text>
            </g>
          );
        })}
      </svg>
      {markers && markers.size > 0 && (
        <p className="mt-1 text-xs text-neutral-400">⚠ période où les décès dépassent nettement la moyenne (signal statistique, pas une cause identifiée).</p>
      )}
    </div>
  );
}
