import { describe, it, expect } from 'vitest';
import { isDateProofValid, EMPTY_DATE_PROOF } from './DateProofInput.jsx';

describe('isDateProofValid', () => {
  it('refuse une preuve vide ou sans type choisi', () => {
    expect(isDateProofValid(EMPTY_DATE_PROOF)).toBe(false);
    expect(isDateProofValid(null)).toBe(false);
    expect(isDateProofValid({ type: '', url: '', file: null })).toBe(false);
  });

  it('accepte "informations familiales" sans fichier ni url', () => {
    expect(isDateProofValid({ type: 'family', url: '', file: null })).toBe(true);
  });

  it('refuse "acte" sans fichier ni url', () => {
    expect(isDateProofValid({ type: 'acte', url: '', file: null })).toBe(false);
    expect(isDateProofValid({ type: 'acte', url: '   ', file: null })).toBe(false);
  });

  it('accepte "acte" avec seulement une url', () => {
    expect(isDateProofValid({ type: 'acte', url: 'https://archives.example.org/acte123', file: null })).toBe(true);
  });

  it('accepte "acte" avec seulement un fichier', () => {
    expect(isDateProofValid({ type: 'acte', url: '', file: new File(['x'], 'acte.pdf') })).toBe(true);
  });
});
