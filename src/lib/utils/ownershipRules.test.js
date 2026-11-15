import { describe, it, expect } from 'vitest';
import {
  ownershipConfirmationPhrase,
  SELF_DOWNGRADE_PHRASE,
  invitableRoles,
  memberRoleLabel,
} from './ownershipRules.js';

describe('phrase de confirmation du transfert', () => {
  it('reprend l\'e-mail du destinataire en minuscules, sans espaces autour', () => {
    expect(ownershipConfirmationPhrase('  Jean.Dupont@Mail.fr ')).toBe(
      "je souhaite transférer la propriété de cet arbre au propriétaire de l'adresse mail jean.dupont@mail.fr",
    );
  });
  it('gère un e-mail vide sans planter', () => {
    expect(ownershipConfirmationPhrase(undefined)).toMatch(/adresse mail $/);
  });
});

describe('rétrogradation volontaire', () => {
  it('a une phrase fixe', () => {
    expect(SELF_DOWNGRADE_PHRASE).toBe('je souhaite devenir membre de cet arbre');
  });
});

describe('rôles invitables', () => {
  it('un admin ne peut inviter que des membres', () => {
    expect(invitableRoles(false).map((r) => r.value)).toEqual(['guest']);
  });
  it('le propriétaire peut inviter un admin ou un membre', () => {
    expect(invitableRoles(true).map((r) => r.value)).toEqual(['admin', 'guest']);
  });
});

describe('libellés de rôle', () => {
  it('le propriétaire est affiché comme tel, quel que soit son rôle en base', () => {
    expect(memberRoleLabel('admin', true)).toBe('Propriétaire');
  });
  it('un membre est affiché comme Membre', () => {
    expect(memberRoleLabel('guest', false)).toBe('Membre');
  });
  it('un admin non propriétaire est affiché comme Admin', () => {
    expect(memberRoleLabel('admin', false)).toBe('Admin');
  });
});
