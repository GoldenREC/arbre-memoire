/**
 * Normalise la casse d'un nom propre ou d'un lieu : une seule majuscule
 * par "mot", le reste en minuscules — où tiret et apostrophe comptent
 * comme des séparateurs de mot au même titre que l'espace (donc suivis
 * d'une majuscule), mais restent dans le résultat (ils ne sont pas
 * remplacés par des espaces).
 *
 * Exemples : "LOICK TERNAY" -> "Loick Ternay", "cagnes-sur-mer" ->
 * "Cagnes-Sur-Mer", "d'artagnan" -> "D'Artagnan" (apostrophe courbe ou
 * droite acceptée). N'ajoute et ne retire aucun accent : une lettre
 * saisie sans accent reste sans accent (ex. "LOICK" -> "Loick", pas
 * "Loïck" — la restitution d'un accent manquant demanderait un
 * dictionnaire de prénoms, hors de portée d'une simple règle de casse).
 *
 * Les espaces multiples sont réduits à un seul, et les espaces en début/
 * fin de chaîne retirés. Une entrée vide, null ou undefined est renvoyée
 * telle quelle.
 */
export function toProperCase(input) {
  if (input == null) return input;
  const trimmed = String(input).trim().replace(/\s+/g, ' ');
  if (!trimmed) return trimmed;
  return trimmed
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_match, sep, letter) => sep + letter.toUpperCase());
}
