import { describe, it, expect } from 'vitest';
import { bornMoreThanYearsAgo, effectiveDeceased } from './deceasedRule.js';

const NOW = new Date(2026, 10, 15); // 15 novembre 2026

describe('règle des 130 ans', () => {
  it('une naissance de 1850 (année seule, 1er janvier) impose « décédé »', () => {
    expect(bornMoreThanYearsAgo('1850-01-01', 130, NOW)).toBe(true);
    expect(effectiveDeceased(false, '1850-01-01', NOW)).toBe(true);
  });
  it('une naissance d\'il y a moins de 130 ans ne l\'impose pas', () => {
    expect(bornMoreThanYearsAgo('1900-01-01', 130, NOW)).toBe(false);
    expect(effectiveDeceased(false, '1900-01-01', NOW)).toBe(false);
  });
  it('la limite tombe exactement à 130 ans : né le 15/11/1896 n\'est pas encore imposé', () => {
    expect(bornMoreThanYearsAgo('1896-11-15', 130, NOW)).toBe(false);
  });
  it('né la veille de la limite : imposé', () => {
    expect(bornMoreThanYearsAgo('1896-11-14', 130, NOW)).toBe(true);
  });
  it('une date absente ou mal formée n\'impose rien', () => {
    expect(bornMoreThanYearsAgo(null, 130, NOW)).toBe(false);
    expect(bornMoreThanYearsAgo('1850', 130, NOW)).toBe(false);
  });
  it('un statut saisi « décédé » reste vrai même pour une naissance récente', () => {
    expect(effectiveDeceased(true, '1990-01-01', NOW)).toBe(true);
  });
});
