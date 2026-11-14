import { describe, it, expect } from 'vitest';
import { describeIncomingRoles } from './incomingRoles.js';

describe('describeIncomingRoles', () => {
  it('décrit père, mère, enfant et conjoint à partir des liens du fichier', () => {
    const roles = describeIncomingRoles({
      individuals: [
        { localId: 'c', firstNames: 'Charles', lastName: 'Ternay', sex: 'M' },
        { localId: 'p', firstNames: 'Joseph', lastName: 'Ternay', sex: 'M' },
        { localId: 'm', firstNames: 'Angèle', lastName: 'Chales', sex: 'F' },
      ],
      filiations: [{ childLocalId: 'c', parentLocalId: 'p' }, { childLocalId: 'c', parentLocalId: 'm' }],
      families: [{ partnerLocalIds: ['p', 'm'] }],
    });
    expect(roles.get('p')).toBe('père de Charles Ternay ; conjoint(e) de Angèle Chales');
    expect(roles.get('m')).toBe('mère de Charles Ternay ; conjoint(e) de Joseph Ternay');
    expect(roles.get('c')).toBe('enfant de Joseph Ternay et Angèle Chales');
  });
});
