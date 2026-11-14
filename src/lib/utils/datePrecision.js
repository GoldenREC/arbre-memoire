/**
 * Précision d'une date (naissance/décès/événement), rattachée à
 * `individuals.birth_date_precision` / `death_date_precision` et
 * `events.date_precision`. Centralisé ici car utilisé à la fois par le
 * formulaire de création d'une fiche et par l'édition de l'en-tête
 * (CivilHeader) — les deux doivent proposer exactement les mêmes choix.
 *
 * Ne couvre volontairement que les valeurs déjà exposées côté
 * interface avant ce fichier (exact/about/before/after/unknown) ; la
 * colonne autorise aussi 'between', pas encore proposé dans aucun
 * formulaire — gap préexistant, non traité ici.
 */
export const PRECISION_OPTIONS = [
  { value: 'exact', label: 'Exacte' },
  { value: 'about', label: 'Vers' },
  { value: 'before', label: 'Avant' },
  { value: 'after', label: 'Après' },
  { value: 'unknown', label: 'Inconnue' },
];
