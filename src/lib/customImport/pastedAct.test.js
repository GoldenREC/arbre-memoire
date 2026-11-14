import { describe, it, expect } from 'vitest';
import { extractJson, collectImagePaths, matchImages } from './pastedAct.js';

describe('extractJson', () => {
  it('lit un JSON brut, un bloc ```json, ou un JSON entouré de texte', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Voici le résultat :\n```json\n{"a":1}\n```\nBonne journée')).toEqual({ a: 1 });
    expect(extractJson('Résultat : {"a":{"b":2}} fin')).toEqual({ a: { b: 2 } });
  });
  it('refuse un texte vide ou invalide avec un message clair', () => {
    expect(() => extractJson('')).toThrow(/Colle le JSON/);
    expect(() => extractJson('pas du json')).toThrow(/JSON valide/);
  });
});

describe('collectImagePaths / matchImages', () => {
  const model = {
    individuals: [{ birth: { proof: { type: 'acte', imageFile: 'images/acte.jpg' } }, events: [{ proof: { imageFile: 'images/acte.jpg' } }] }],
    unions: [{ marriage: { proof: { type: 'marginal', imageFile: 'images/page2.jpg' } } }],
  };
  const file = (name) => ({ name });

  it('recense chaque image citée une seule fois', () => {
    expect([...collectImagePaths(model)]).toEqual(['images/acte.jpg', 'images/page2.jpg']);
  });
  it('associe par nom de fichier', () => {
    const { imagesByPath, missing } = matchImages(['images/acte.jpg', 'images/page2.jpg'], [file('Page2.jpg'), file('acte.jpg')]);
    expect(imagesByPath.get('images/acte.jpg').name).toBe('acte.jpg');
    expect(imagesByPath.get('images/page2.jpg').name).toBe('Page2.jpg');
    expect(missing).toEqual([]);
  });
  it("utilise l'unique fichier fourni pour tous les chemins, quel que soit son nom", () => {
    const { imagesByPath, missing } = matchImages(['images/acte.jpg', 'images/page2.jpg'], [file('IMG_2041.jpeg')]);
    expect(imagesByPath.size).toBe(2);
    expect(missing).toEqual([]);
  });
  it('signale les images sans fichier', () => {
    expect(matchImages(['images/acte.jpg'], []).missing).toEqual(['images/acte.jpg']);
  });
});
