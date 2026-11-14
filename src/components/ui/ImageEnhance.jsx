/**
 * Amélioration d'image pour les visionneuses (actes et photos) : netteté,
 * contraste et luminosité réglables, en plus des filtres de couleur.
 *
 * La netteté passe par un filtre SVG de convolution (accentuation des
 * contours) ; contraste et luminosité par les filtres CSS. Rien n'est
 * modifié dans le fichier d'origine : c'est un réglage d'affichage. Une
 * image floue parce que scannée en basse définition ne peut pas regagner
 * de vrais détails — l'accentuation rend seulement le texte plus lisible.
 */
export const DEFAULT_ENHANCE = { sharpen: 0, contrast: 1, brightness: 1 };
export const AUTO_ENHANCE = { sharpen: 1.5, contrast: 1.3, brightness: 1.05 };

export function isEnhanced(e) {
  return e.sharpen !== 0 || e.contrast !== 1 || e.brightness !== 1;
}

/** Valeur CSS `filter` complète : netteté (SVG) + contraste/luminosité + filtre de couleur existant. */
export function enhanceFilterCss(enhance, filterId, baseCss = 'none') {
  const parts = [];
  if (enhance.sharpen > 0) parts.push(`url(#${filterId})`);
  if (enhance.contrast !== 1) parts.push(`contrast(${enhance.contrast})`);
  if (enhance.brightness !== 1) parts.push(`brightness(${enhance.brightness})`);
  if (baseCss && baseCss !== 'none') parts.push(baseCss);
  return parts.length ? parts.join(' ') : 'none';
}

/** Noyau d'accentuation 3×3 : centre renforcé, voisins soustraits (somme = 1, la luminosité globale ne bouge pas). */
export function sharpenKernel(amount) {
  const a = Math.max(0, amount);
  return `0 ${-a} 0 ${-a} ${1 + 4 * a} ${-a} 0 ${-a} 0`;
}

/** Définition du filtre SVG, à poser une fois près de l'image. */
export function SharpenFilterDef({ id, amount }) {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute">
      <filter id={id} colorInterpolationFilters="sRGB">
        <feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix={sharpenKernel(amount)} />
      </filter>
    </svg>
  );
}

function Slider({ label, value, min, max, step, onChange }) {
  return (
    <label className="flex items-center gap-2 text-xs text-white">
      <span className="w-20">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-32" />
    </label>
  );
}

/** Panneau de réglages (netteté, contraste, luminosité) avec amélioration automatique et remise à zéro. */
export function EnhancePanel({ value, onChange, naturalSize }) {
  const megapixels = naturalSize ? (naturalSize.width * naturalSize.height) / 1e6 : null;
  return (
    <div className="space-y-2 rounded-xl bg-black/70 p-3">
      <div className="flex gap-2">
        <button onClick={() => onChange(AUTO_ENHANCE)} className="rounded bg-accent-600 px-2 py-1 text-xs font-medium text-white hover:bg-accent-700">
          Améliorer automatiquement
        </button>
        <button onClick={() => onChange(DEFAULT_ENHANCE)} disabled={!isEnhanced(value)} className="rounded px-2 py-1 text-xs text-white/80 hover:text-white disabled:opacity-40">
          Réinitialiser
        </button>
      </div>
      <Slider label="Netteté" min={0} max={3} step={0.25} value={value.sharpen} onChange={(v) => onChange({ ...value, sharpen: v })} />
      <Slider label="Contraste" min={0.6} max={2} step={0.05} value={value.contrast} onChange={(v) => onChange({ ...value, contrast: v })} />
      <Slider label="Luminosité" min={0.6} max={1.6} step={0.05} value={value.brightness} onChange={(v) => onChange({ ...value, brightness: v })} />
      {naturalSize && (
        <p className="max-w-[16rem] text-[11px] text-white/70">
          Fichier : {naturalSize.width} × {naturalSize.height} px.
          {megapixels < 1.5 && ' Définition faible : pour une image vraiment nette, il faut rescanner ou retélécharger l’acte en meilleure qualité.'}
        </p>
      )}
    </div>
  );
}
