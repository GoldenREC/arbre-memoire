import { describe, it, expect } from 'vitest';
import { toProperCase } from './properCase.js';

describe('toProperCase', () => {
  it('met une seule majuscule par mot pour une saisie en capitales', () => {
    expect(toProperCase('LOICK PAUL DANIEL TERNAY')).toBe('Loick Paul Daniel Ternay');
  });

  it('capitalise après un tiret, sans le remplacer par un espace', () => {
    expect(toProperCase('cagnes-sur-mer')).toBe('Cagnes-Sur-Mer');
  });

  it('capitalise après une apostrophe droite', () => {
    expect(toProperCase("d'artagnan")).toBe("D'Artagnan");
  });

  it('capitalise après une apostrophe courbe', () => {
    expect(toProperCase('d’artagnan')).toBe('D’Artagnan');
  });

  it('préserve les accents déjà présents', () => {
    expect(toProperCase('loïck térnay')).toBe('Loïck Térnay');
  });

  it('réduit les espaces multiples et retire les espaces en trop', () => {
    expect(toProperCase('  jean   pierre  ')).toBe('Jean Pierre');
  });

  it('gère une saisie déjà correctement casée sans la changer', () => {
    expect(toProperCase('Jean-Baptiste')).toBe('Jean-Baptiste');
  });

  it("renvoie l'entrée telle quelle pour null/undefined/vide", () => {
    expect(toProperCase(null)).toBeNull();
    expect(toProperCase(undefined)).toBeUndefined();
    expect(toProperCase('')).toBe('');
    expect(toProperCase('   ')).toBe('');
  });

  it('gère un mot unique sans séparateur', () => {
    expect(toProperCase('PARIS')).toBe('Paris');
  });
});
