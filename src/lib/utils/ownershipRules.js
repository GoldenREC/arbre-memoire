/**
 * Règles pures de propriété et de rôles (sans accès réseau, donc testables).
 * Les mêmes textes sont vérifiés côté base : voir supabase/multi_tree.sql.
 */

/** Texte exact que le propriétaire doit taper pour transférer l'arbre. */
export function ownershipConfirmationPhrase(email) {
  return `je souhaite transférer la propriété de cet arbre au propriétaire de l'adresse mail ${String(email || '').trim().toLowerCase()}`;
}

/** Texte à taper pour qu'un admin se rétrograde en membre. */
export const SELF_DOWNGRADE_PHRASE = 'je souhaite devenir membre de cet arbre';

/** Rôles : propriétaire (ligne admin + trees.owner_id), admin (crée, modifie), membre (lecture seule). */
export const ROLE_LABELS = { owner: 'Propriétaire', admin: 'Admin', guest: 'Membre' };

export const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', description: 'Crée et modifie les fiches, les lieux, les dates et les actes. Ne supprime ni fiches ni arbre.' },
  { value: 'guest', label: 'Membre', description: 'Consultation uniquement.' },
];

/** Un admin ne peut inviter que des membres ; seul le propriétaire invite directement un admin. */
export function invitableRoles(isOwner) {
  return isOwner ? ROLE_OPTIONS : ROLE_OPTIONS.filter((r) => r.value === 'guest');
}

/** Libellé d'un membre, en tenant compte du propriétaire. */
export function memberRoleLabel(role, isOwner) {
  if (isOwner) return ROLE_LABELS.owner;
  return ROLE_LABELS[role] || role;
}
