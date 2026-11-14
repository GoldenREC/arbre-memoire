import { CATEGORICAL, useChartMode } from '../chartColors.js';
import { useElementWidth } from '../../../hooks/useElementWidth.js';

const VIEWBOX_WIDTH = 200;

/**
 * Contrepartie horizontale appliquée à un <text> pour annuler l'étirement
 * non uniforme causé par `preserveAspectRatio="none"` (le viewBox fait
 * `VIEWBOX_WIDTH` unités de large, mais le SVG est rendu sur toute la
 * largeur réelle du conteneur — sans ça, chaque glyphe serait étiré
 * horizontalement d'un facteur `scaleX`, le rendant illisible). La
 * mise à l'échelle inverse se fait autour de `tx` pour que le texte
 * garde sa position apparente.
 */
function unstretch(tx, scaleX) {
  return scaleX === 1 ? undefined : `translate(${tx},0) scale(${1 / scaleX},1) translate(${-tx},0)`;
}

/**
 * Pyramide des âges : barres horizontales dos-à-dos, Hommes à gauche,
 * Femmes à droite, par tranche de 10 ans. Deux teintes catégorielles
 * fixes (jamais inversées) plutôt qu'une seule couleur recolorée par
 * sexe, pour rester lisible en daltonisme comme en niveaux de gris.
 */
export default function AgePyramidChart({ rows, height = 260 }) {
  const mode = useChartMode();
  const [maleColor, femaleColor] = CATEGORICAL[mode];
  const [svgRef, measuredWidth] = useElementWidth();
  const scaleX = measuredWidth > 0 ? measuredWidth / VIEWBOX_WIDTH : 1;

  if (!rows.length) return <p className="text-sm text-neutral-400">Pas assez de données.</p>;

  const max = Math.max(1, ...rows.flatMap((r) => [r.M, r.F]));
  const rowH = Math.min(18, (height - 10) / rows.length);
  const totalH = rowH * rows.length + 10;

  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: maleColor }} /> Hommes</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: femaleColor }} /> Femmes</span>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${VIEWBOX_WIDTH} ${totalH}`} className="w-full" style={{ height: totalH }} preserveAspectRatio="none">
        {rows.map((r, i) => {
          const y = i * rowH;
          const axisM = 88;
          const axisF = 112;
          const maxBarW = 78;
          const mW = (r.M / max) * maxBarW;
          const fW = (r.F / max) * maxBarW;
          const mTextX = axisM - mW - 2;
          const fTextX = axisF + fW + 2;
          return (
            <g key={r.label}>
              <rect x={axisM - mW} y={y + 1} width={mW} height={rowH - 2} fill={maleColor}>
                <title>{`${r.label} ans — Hommes : ${r.M}`}</title>
              </rect>
              <rect x={axisF} y={y + 1} width={fW} height={rowH - 2} fill={femaleColor}>
                <title>{`${r.label} ans — Femmes : ${r.F}`}</title>
              </rect>
              {r.M > 0 && (
                <text x={mTextX} y={y + rowH / 2 + 2} textAnchor="end" fontSize="5.5" transform={unstretch(mTextX, scaleX)} className="fill-neutral-500 dark:fill-neutral-400">{r.M}</text>
              )}
              {r.F > 0 && (
                <text x={fTextX} y={y + rowH / 2 + 2} textAnchor="start" fontSize="5.5" transform={unstretch(fTextX, scaleX)} className="fill-neutral-500 dark:fill-neutral-400">{r.F}</text>
              )}
              <text x="100" y={y + rowH / 2 + 2} textAnchor="middle" fontSize="5" transform={unstretch(100, scaleX)} className="fill-neutral-400 dark:fill-neutral-500">{r.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
