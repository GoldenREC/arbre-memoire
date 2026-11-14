/**
 * Département français -> région actuelle. Sert à ranger un lieu dans
 * la bonne région (et en France) quand seul son département est connu,
 * ce qui est le cas de la plupart des lieux saisis ou importés.
 */
const REGIONS = {
  'Auvergne-Rhône-Alpes': ['Ain', 'Allier', 'Ardèche', 'Cantal', 'Drôme', 'Isère', 'Loire', 'Haute-Loire', 'Puy-de-Dôme', 'Rhône', 'Métropole de Lyon', 'Savoie', 'Haute-Savoie'],
  'Bourgogne-Franche-Comté': ["Côte-d'Or", 'Doubs', 'Jura', 'Nièvre', 'Haute-Saône', 'Saône-et-Loire', 'Yonne', 'Territoire de Belfort'],
  Bretagne: ["Côtes-d'Armor", 'Finistère', 'Ille-et-Vilaine', 'Morbihan'],
  'Centre-Val de Loire': ['Cher', 'Eure-et-Loir', 'Indre', 'Indre-et-Loire', 'Loir-et-Cher', 'Loiret'],
  Corse: ['Corse-du-Sud', 'Haute-Corse', 'Corse'],
  'Grand Est': ['Ardennes', 'Aube', 'Marne', 'Haute-Marne', 'Meurthe-et-Moselle', 'Meuse', 'Moselle', 'Bas-Rhin', 'Haut-Rhin', 'Vosges'],
  'Hauts-de-France': ['Aisne', 'Nord', 'Oise', 'Pas-de-Calais', 'Somme'],
  'Île-de-France': ['Paris', 'Seine-et-Marne', 'Yvelines', 'Essonne', 'Hauts-de-Seine', 'Seine-Saint-Denis', 'Val-de-Marne', "Val-d'Oise", 'Seine', 'Seine-et-Oise'],
  Normandie: ['Calvados', 'Eure', 'Manche', 'Orne', 'Seine-Maritime', 'Seine-Inférieure'],
  'Nouvelle-Aquitaine': ['Charente', 'Charente-Maritime', 'Charente-Inférieure', 'Corrèze', 'Creuse', 'Dordogne', 'Gironde', 'Landes', 'Lot-et-Garonne', 'Pyrénées-Atlantiques', 'Basses-Pyrénées', 'Deux-Sèvres', 'Vienne', 'Haute-Vienne'],
  Occitanie: ['Ariège', 'Aude', 'Aveyron', 'Gard', 'Haute-Garonne', 'Gers', 'Hérault', 'Lot', 'Lozère', 'Hautes-Pyrénées', 'Pyrénées-Orientales', 'Tarn', 'Tarn-et-Garonne'],
  'Pays de la Loire': ['Loire-Atlantique', 'Loire-Inférieure', 'Maine-et-Loire', 'Mayenne', 'Sarthe', 'Vendée'],
  "Provence-Alpes-Côte d'Azur": ['Alpes-de-Haute-Provence', 'Basses-Alpes', 'Hautes-Alpes', 'Alpes-Maritimes', 'Bouches-du-Rhône', 'Var', 'Vaucluse'],
  Guadeloupe: ['Guadeloupe'],
  Martinique: ['Martinique'],
  Guyane: ['Guyane'],
  'La Réunion': ['La Réunion', 'Réunion'],
  Mayotte: ['Mayotte'],
};

const key = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z]/g, '').toLowerCase();

const REGION_BY_DEPARTMENT = new Map();
for (const [region, departments] of Object.entries(REGIONS)) {
  for (const d of departments) REGION_BY_DEPARTMENT.set(key(d), region);
}

/** Région d'un département français (accents, tirets et casse ignorés), sinon null. */
export function regionOfFrenchDepartment(department) {
  return REGION_BY_DEPARTMENT.get(key(department)) || null;
}
