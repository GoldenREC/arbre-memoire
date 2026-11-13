/**
 * Règle de confidentialité RGPD : une personne est considérée "vivante"
 * (et donc à masquer pour les utilisateurs non autorisés) si elle est
 * née il y a moins de `thresholdYears` ET qu'aucune date de décès
 * n'est connue. Le seuil est réglable par arbre depuis Paramètres
 * (`trees.privacy_threshold_years`, défaut 100) ; cette même règle
 * existe côté base (vue v_individuals_with_privacy), dupliquée ici pour
 * un rendu instantané côté client sans aller-retour.
 */
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export function isPrivacyProtected(individual, thresholdYears = 100) {
  if (individual.deathDate || individual.isDeceased) return false;
  if (!individual.birthDate) return false; // prudence : sans date, on ne masque pas par défaut
  const birth = new Date(individual.birthDate).getTime();
  return Date.now() - birth < thresholdYears * YEAR_MS;
}

/**
 * Retourne une version "masquée" d'un individu pour un visiteur sans
 * droits suffisants : seules les informations non identifiantes
 * (génération, lien de parenté) restent visibles.
 */
export function maskIndividual(individual) {
  return {
    ...individual,
    firstNames: 'Personne',
    lastName: 'vivante',
    birthName: null,
    biography: null,
    occupation: null,
    birthDate: null,
    birthPlaceLocalId: null,
    masked: true,
  };
}

/** role: 'admin' | 'family' | 'guest' | null (non connecté) */
export function canViewFullDetails(role) {
  return role === 'admin' || role === 'family';
}

export function applyPrivacyRules(individuals, role, thresholdYears = 100) {
  if (canViewFullDetails(role)) return individuals;
  return individuals.map((ind) => (isPrivacyProtected(ind, thresholdYears) ? maskIndividual(ind) : ind));
}
