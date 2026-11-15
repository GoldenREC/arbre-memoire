import { describe, it, expect } from 'vitest';
import { planRuleAudit } from './ruleAudit.js';

const NOW = new Date(2026, 10, 15);

const person = (over = {}) => ({
  id: 'p1', firstNames: 'Jean', lastName: 'Test', birthDate: '1990-03-01', birthPlaceId: null,
  deathDate: null, deathPlaceId: null, isDeceased: false, ...over,
});

describe('planRuleAudit — règle des 130 ans', () => {
  it('signale une naissance ancienne non cochée « décédé »', () => {
    const f = planRuleAudit({ individuals: [person({ birthDate: '1850-01-01' })], now: NOW });
    expect(f.map((x) => x.kind)).toContain('deceased_130');
    expect(f.find((x) => x.kind === 'deceased_130').fixable).toBe(true);
  });

  it('ne signale pas une naissance récente', () => {
    const f = planRuleAudit({ individuals: [person()], now: NOW });
    expect(f.find((x) => x.kind === 'deceased_130')).toBeUndefined();
  });
});

describe('planRuleAudit — preuves des naissances et décès', () => {
  it('signale une date de naissance sans aucune preuve rattachée', () => {
    const f = planRuleAudit({ individuals: [person()], events: [], citations: [], now: NOW });
    expect(f.find((x) => x.kind === 'proof_birth')).toBeTruthy();
  });

  it('signale un lieu de naissance seul sans preuve', () => {
    const f = planRuleAudit({ individuals: [person({ birthDate: null, birthPlaceId: 'pl1' })], now: NOW });
    expect(f.find((x) => x.kind === 'proof_birth')).toBeTruthy();
  });

  it('ne signale pas une naissance dont l\'événement est cité (acte ou information familiale)', () => {
    const events = [{ id: 'e1', subjectKind: 'individual', subjectId: 'p1', eventType: 'birth' }];
    const citations = [{ id: 'c1', eventId: 'e1' }];
    const f = planRuleAudit({ individuals: [person()], events, citations, now: NOW });
    expect(f.find((x) => x.kind === 'proof_birth')).toBeUndefined();
  });

  it('ne demande pas de preuve à une fiche sans information de naissance', () => {
    const f = planRuleAudit({ individuals: [person({ birthDate: null })], now: NOW });
    expect(f.find((x) => x.kind === 'proof_birth')).toBeUndefined();
  });

  it('exige une preuve pour un décès seulement si la personne est décédée', () => {
    const vivant = planRuleAudit({ individuals: [person({ deathDate: '2000-01-01' })], now: NOW });
    expect(vivant.find((x) => x.kind === 'proof_death')).toBeUndefined();
    const mort = planRuleAudit({ individuals: [person({ isDeceased: true, deathDate: '2000-01-01' })], now: NOW });
    expect(mort.find((x) => x.kind === 'proof_death')).toBeTruthy();
  });
});

describe('planRuleAudit — preuves des jalons d\'union', () => {
  it('signale un mariage daté sans preuve, et pas un jalon vide', () => {
    const events = [
      { id: 'e1', subjectKind: 'union', subjectId: 'u1', eventType: 'marriage', date: '1980-06-01' },
      { id: 'e2', subjectKind: 'union', subjectId: 'u1', eventType: 'divorce', date: null, placeId: null },
    ];
    const partnersByUnion = new Map([['u1', ['p1', 'p2']]]);
    const f = planRuleAudit({ individuals: [person()], events, citations: [], partnersByUnion, now: NOW });
    const unions = f.filter((x) => x.kind === 'proof_union');
    expect(unions).toHaveLength(1);
    expect(unions[0].individualIds).toEqual(['p1', 'p2']);
  });
});
