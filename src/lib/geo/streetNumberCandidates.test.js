import { describe, expect, it } from 'vitest';
import { BAN_MIN_SCORE, streetNumberCandidates } from './geocoder.js';

describe('streetNumberCandidates', () => {
  it('lit une plage : "46-48" → 46 puis 48', () => {
    expect(streetNumberCandidates('46-48')).toEqual(['46', '48']);
  });
  it('accepte les tirets longs et les séparateurs à espaces', () => {
    expect(streetNumberCandidates('46 – 48')).toEqual(['46', '48']);
  });
  it('un numéro simple ou suivi de "bis" donne le numéro seul', () => {
    expect(streetNumberCandidates('12')).toEqual(['12']);
    expect(streetNumberCandidates('46 bis')).toEqual(['46']);
  });
  it('vide ou sans chiffre : aucun numéro', () => {
    expect(streetNumberCandidates('')).toEqual([]);
    expect(streetNumberCandidates(null)).toEqual([]);
  });
  it('le seuil BAN est défini', () => {
    expect(BAN_MIN_SCORE).toBeGreaterThan(0);
  });
});
