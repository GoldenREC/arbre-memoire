/** Calculs purs du canevas de l'arbre (zoom, déplacement, ajustement). */
export const MIN_SCALE = 0.2;
export const MAX_SCALE = 2.5;

export function clampScale(s) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** Zoome d'un facteur en gardant le point (cx, cy) de l'écran immobile. */
export function zoomAt(view, factor, cx, cy) {
  const scale = clampScale(view.scale * factor);
  const ratio = scale / view.scale;
  return {
    scale,
    x: cx - (cx - view.x) * ratio,
    y: cy - (cy - view.y) * ratio,
  };
}

/** Vue qui fait tenir `bounds` dans le cadre (largeur, hauteur), centré, sans zoomer au-delà de 1. */
export function fitView(bounds, width, height) {
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const scale = clampScale(Math.min(width / bw, height / bh, 1));
  return {
    scale,
    x: (width - bw * scale) / 2 - bounds.minX * scale,
    y: (height - bh * scale) / 2 - bounds.minY * scale,
  };
}
