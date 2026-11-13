/**
 * Jeu de correspondances historiques de départ — quelques exemples
 * illustratifs et bien documentés pour amorcer la table
 * `historical_place_aliases`, à vérifier et compléter selon les
 * lignées réellement présentes dans l'arbre (voir le panneau "Lieux à
 * résoudre" de la carte pour en ajouter d'autres). Couvre les zones
 * mentionnées dans le cahier des charges (France/Corse, Pérou, Italie,
 * Suisse, Belgique, Luxembourg, Allemagne) dans la mesure de ce qui
 * est historiquement bien établi — volontairement limité plutôt que de
 * deviner des dates de fusion de communes incertaines.
 */
export const STARTER_HISTORICAL_ALIASES = [
  {
    pattern: 'strasbourg',
    yearStart: 1871, yearEnd: 1918,
    canonicalLabel: 'Straßburg (annexion allemande, 1871-1918)',
    latitude: 48.5734, longitude: 7.7521, country: 'Allemagne (époque)', region: 'Alsace-Lorraine',
    notes: "Strasbourg a porté le nom allemand \"Straßburg\" sous l'annexion de 1871 à 1918 (traité de Francfort), puis à nouveau de 1940 à 1944/45.",
  },
  {
    pattern: 'strassburg',
    yearStart: 1871, yearEnd: 1945,
    canonicalLabel: 'Strasbourg',
    latitude: 48.5734, longitude: 7.7521, country: 'France', region: 'Alsace',
    notes: 'Variante orthographique allemande rencontrée dans les registres de la période annexée.',
  },
  {
    pattern: 'mulhouse',
    yearStart: 1871, yearEnd: 1918,
    canonicalLabel: 'Mülhausen (annexion allemande, 1871-1918)',
    latitude: 47.7508, longitude: 7.3359, country: 'Allemagne (époque)', region: 'Alsace-Lorraine',
    notes: "Nom allemand porté sous l'annexion 1871-1918 et 1940-1945.",
  },
  {
    pattern: 'colmar',
    yearStart: 1871, yearEnd: 1918,
    canonicalLabel: 'Kolmar (annexion allemande, 1871-1918)',
    latitude: 48.0794, longitude: 7.3585, country: 'Allemagne (époque)', region: 'Alsace-Lorraine',
    notes: "Nom allemand porté sous l'annexion 1871-1918 et 1940-1945.",
  },
  {
    pattern: 'lima',
    yearStart: 1535, yearEnd: 1600,
    canonicalLabel: 'Ciudad de los Reyes (nom fondateur de Lima)',
    latitude: -12.0464, longitude: -77.0428, country: 'Pérou (vice-royauté)', region: 'Lima',
    notes: "Lima a été fondée en 1535 par Francisco Pizarro sous le nom de \"Ciudad de los Reyes\" (ville des Rois) ; le nom \"Lima\" (dérivé du quechua \"Rímac\") s'est progressivement imposé dans l'usage courant.",
  },
  {
    pattern: 'liege',
    yearStart: null, yearEnd: null,
    canonicalLabel: 'Liège',
    latitude: 50.6326, longitude: 5.5797, country: 'Belgique', region: 'Wallonie',
    notes: "Variante germanique \"Lüttich\" parfois utilisée dans des registres ou correspondances d'origine allemande — ne correspond pas à un changement de nationalité, juste à l'usage linguistique.",
  },
];
