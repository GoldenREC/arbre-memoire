/**
 * Profils pays pour la saisie structurée des lieux (StructuredPlaceInput) :
 * France, Allemagne, Suisse, Belgique, Angleterre, Espagne, Portugal,
 * Luxembourg, Grèce, Pérou, Thaïlande.
 *
 * Chaque profil associe, pour un pays donné, les libellés affichés aux 9
 * champs fixes du modèle de lieu (streetNumber, streetName, buildingName,
 * arrondissement, city, postalCode, department, region, country — voir
 * lib/utils/placeLabel.js) à la terminologie administrative réelle de ce
 * pays, et indique quelle source d'autocomplétion utiliser pour la
 * commune/ville et, quand c'est fiable, pour le code postal.
 *
 * Le schéma de stockage ne change jamais d'un pays à l'autre : seuls les
 * libellés affichés et la source d'autocomplétion varient. C'est ce qui
 * permet au reste de l'application (placeHierarchy.js, geocoder.js,
 * individualMutations.js, etc.) de continuer à fonctionner sans savoir
 * quel pays est sélectionné.
 *
 * Champs d'un profil :
 * - id : valeur stockée dans place.country (affichée telle quelle aussi
 *   dans le sélecteur de pays).
 * - labels : libellé affiché pour chacun des 9 champs.
 * - search(query) : recherche de communes/villes -> tableau de suggestions
 *   normalisées { label, city, postalCode, department, region, country,
 *   arrondissement, latitude, longitude }. Ne lève jamais d'exception.
 * - searchByPostcode(code) : recherche par code postal, avec le même
 *   format de résultat. Optionnel : absent quand aucune source fiable
 *   n'existe pour ce pays (la saisie du code postal reste alors libre).
 */
import { searchCommunes, searchByPostcode } from './banAddressApi.js';
import { searchLocalities as searchOpenPlz, searchLocalitiesByPostalCode as searchOpenPlzByPostcode } from './openPlzApi.js';
import { searchPlaces as searchUkPlaces, searchByPostcode as searchUkPostcode } from './ukPostcodesApi.js';
import { searchPlaces as searchNominatimPlaces } from './nominatimPlacesApi.js';

const FRANCE = {
  id: 'France',
  labels: {
    region: 'Région',
    department: 'Département',
    postalCode: 'Code postal',
    city: 'Commune / ville',
    arrondissement: 'Arrondissement',
    buildingName: 'Bâtiment / lieu-dit',
    streetName: 'Nom de la rue',
    streetNumber: 'Numéro de rue',
  },
  search: searchCommunes,
  searchByPostcode,
};

const ALLEMAGNE = {
  id: 'Allemagne',
  labels: {
    region: 'État fédéré',
    department: 'Arrondissement rural (Landkreis)',
    postalCode: 'Code postal',
    city: 'Commune / ville',
    arrondissement: 'District urbain (Kreisfreie Stadt)',
    buildingName: 'Bâtiment / lieu-dit',
    streetName: 'Rue',
    streetNumber: 'Numéro de maison',
  },
  search: (q, opts) => searchOpenPlz('de', q, opts),
  searchByPostcode: (code, opts) => searchOpenPlzByPostcode('de', code, opts),
};

const SUISSE = {
  id: 'Suisse',
  labels: {
    region: 'Canton',
    department: 'District',
    postalCode: 'Code postal (NPA)',
    city: 'Commune',
    arrondissement: "Arrondissement / quartier",
    buildingName: 'Bâtiment / lieu-dit',
    streetName: 'Rue',
    streetNumber: 'Numéro de maison',
  },
  search: (q, opts) => searchOpenPlz('ch', q, opts),
  searchByPostcode: (code, opts) => searchOpenPlzByPostcode('ch', code, opts),
};

const ANGLETERRE = {
  id: 'Angleterre',
  labels: {
    region: 'Région',
    department: 'Comté (County)',
    postalCode: 'Postcode',
    city: 'Ville / localité',
    arrondissement: 'District / Borough',
    buildingName: 'Bâtiment / lieu-dit',
    streetName: 'Rue',
    streetNumber: 'Numéro',
  },
  search: searchUkPlaces,
  searchByPostcode: searchUkPostcode,
};

function nominatimProfile(id, countryCode, labels) {
  return {
    id,
    labels,
    search: (q, opts) => searchNominatimPlaces(countryCode, id, q, opts),
    // Nominatim n'est pas fiable pour une recherche par code postal seul
    // (pas d'index dédié) : le code postal reste un champ libre pour ces
    // pays, comme pour tout pays non couvert par un profil spécifique.
  };
}

const BELGIQUE = nominatimProfile('Belgique', 'be', {
  region: 'Région',
  department: 'Province',
  postalCode: 'Code postal',
  city: 'Commune',
  arrondissement: 'Arrondissement administratif',
  buildingName: 'Bâtiment / lieu-dit',
  streetName: 'Rue',
  streetNumber: 'Numéro',
});

const ESPAGNE = nominatimProfile('Espagne', 'es', {
  region: 'Communauté autonome',
  department: 'Province',
  postalCode: 'Code postal',
  city: 'Municipalité / ville',
  arrondissement: 'District municipal',
  buildingName: 'Bâtiment / lieu-dit',
  streetName: 'Rue (Calle)',
  streetNumber: 'Numéro',
});

const PORTUGAL = nominatimProfile('Portugal', 'pt', {
  region: 'Région',
  department: 'District',
  postalCode: 'Code postal',
  city: 'Municipalité (Concelho)',
  arrondissement: 'Freguesia (paroisse civile)',
  buildingName: 'Bâtiment / lieu-dit',
  streetName: 'Rue (Rua)',
  streetNumber: 'Numéro',
});

const LUXEMBOURG = nominatimProfile('Luxembourg', 'lu', {
  region: 'District',
  department: 'Canton',
  postalCode: 'Code postal',
  city: 'Commune',
  arrondissement: 'Section',
  buildingName: 'Bâtiment / lieu-dit',
  streetName: 'Rue',
  streetNumber: 'Numéro',
});

const PEROU = nominatimProfile('Pérou', 'pe', {
  region: 'Région / Département',
  department: 'Province',
  postalCode: 'Code postal',
  city: 'Ville / centre peuplé',
  arrondissement: 'District (Distrito)',
  buildingName: 'Bâtiment / lieu-dit',
  streetName: 'Rue (Calle / Jirón / Avenida)',
  streetNumber: 'Numéro',
});

const THAILANDE = nominatimProfile('Thaïlande', 'th', {
  region: 'Province (Changwat)',
  department: 'District (Amphoe)',
  postalCode: 'Code postal',
  city: 'Ville / village (Mueang / Muban)',
  arrondissement: 'Sous-district (Tambon)',
  buildingName: 'Bâtiment / lieu-dit',
  streetName: 'Rue (Thanon)',
  streetNumber: 'Numéro',
});

const GRECE = nominatimProfile('Grèce', 'gr', {
  region: 'Région (Périphérie)',
  department: 'Unité régionale',
  postalCode: 'Code postal (TK)',
  city: 'Municipalité (Dimos)',
  arrondissement: 'Communauté municipale',
  buildingName: 'Bâtiment / lieu-dit',
  streetName: 'Rue (Odos)',
  streetNumber: 'Numéro',
});

export const COUNTRY_PROFILES = [
  FRANCE, ALLEMAGNE, SUISSE, BELGIQUE, ANGLETERRE, ESPAGNE, PORTUGAL, LUXEMBOURG, GRECE, PEROU, THAILANDE,
];

const BY_ID = new Map(COUNTRY_PROFILES.map((p) => [p.id, p]));

/** Profil pour un pays donné, ou un profil générique (libellés français par défaut, aucune autocomplétion) si inconnu ou vide. */
export function getCountryProfile(countryId) {
  return BY_ID.get(countryId) || GENERIC_PROFILE;
}

export const GENERIC_PROFILE = {
  id: '',
  labels: {
    region: 'Région',
    department: 'Département / État',
    postalCode: 'Code postal',
    city: 'Commune / ville',
    arrondissement: 'Arrondissement',
    buildingName: 'Bâtiment / lieu-dit',
    streetName: 'Nom de la rue',
    streetNumber: 'Numéro de rue',
  },
  search: null,
  searchByPostcode: null,
};
