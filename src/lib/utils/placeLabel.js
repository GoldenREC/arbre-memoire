/**
 * Forme vide d'un lieu structuré (voir components/ui/StructuredPlaceInput.jsx)
 * et composition d'un libellé lisible à partir de ces champs — utilisé à la
 * fois par le composant de saisie (UI) et par la résolution en base
 * (lib/db), d'où son isolement ici plutôt que dans le composant.
 */
export const EMPTY_PLACE = {
  streetNumber: '', streetName: '', buildingName: '', arrondissement: '',
  city: '', postalCode: '', department: '', region: '', country: '',
};

/** Compose un libellé lisible à partir des champs structurés — utilisé pour raw_label (affichage par défaut, recherche, export). */
export function composePlaceLabel(place) {
  const line1 = [place.streetNumber, place.streetName].filter(Boolean).join(' ');
  const parts = [
    line1 || null,
    place.buildingName || null,
    place.arrondissement || null,
    [place.postalCode, place.city].filter(Boolean).join(' ') || null,
    place.department && place.department !== place.city ? place.department : null,
    place.region && place.region !== place.department ? place.region : null,
    place.country || null,
  ].filter(Boolean);
  return parts.join(', ');
}

/** Un lieu structuré a-t-il au moins un champ renseigné ? */
export function isPlaceEmpty(place) {
  return !place || Object.values(place).every((v) => !v || !String(v).trim());
}
