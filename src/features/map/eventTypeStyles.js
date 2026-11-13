/**
 * Catégories affichées par la barre de filtres de la carte — les types
 * d'événements fins (voir EVENT_TYPE_LABELS dans EventForm.jsx) sont
 * regroupés en 4 familles pour rester lisibles sur une carte.
 */
export const MAP_CATEGORIES = {
  birth: { label: 'Naissances', icon: '👶', color: '#34d399' },
  death: { label: 'Décès', icon: '✝︎', color: '#64748b' },
  marriage: { label: 'Mariages', icon: '💍', color: '#f472b6' },
  other: { label: 'Autres', icon: '📍', color: '#38bdf8' },
};

export function categoryOf(eventType) {
  if (eventType === 'birth') return 'birth';
  if (eventType === 'death') return 'death';
  if (eventType === 'marriage') return 'marriage';
  return 'other';
}

/** Petite palette distincte pour colorer un chemin de migration par personne sélectionnée. */
const PATH_COLORS = ['#38bdf8', '#fbbf24', '#34d399', '#a78bfa', '#fb7185', '#2dd4bf', '#f97316', '#818cf8'];
export function pathColorAt(index) {
  return PATH_COLORS[index % PATH_COLORS.length];
}
