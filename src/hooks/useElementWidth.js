import { useEffect, useRef, useState } from 'react';

/**
 * Largeur réelle (en pixels) d'un élément, mise à jour via
 * ResizeObserver. Utilisé par les graphiques SVG maison (voir
 * features/stats/charts) : leur viewBox doit correspondre à la largeur
 * réellement rendue pour que le texte ne soit pas étiré de façon non
 * uniforme (cf. TreeConnectors.jsx qui mesure déjà le DOM de la même
 * façon pour les connecteurs de l'arbre).
 *
 * Retourne 0 tant que la mesure n'a pas encore eu lieu (premier rendu) :
 * les appelants doivent prévoir un fallback pour ce cas.
 */
export function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
