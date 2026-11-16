import { describe, expect, it } from 'vitest';
import { FILIATION_STYLE, linkStyle } from './filiationStyle.js';

describe('linkStyle', () => {
  it('prend le lien le plus fort entre un enfant et un parent, pas le premier trouvé', () => {
    const graph = {
      parentsOf: new Map([['c', [
        { parentId: 'p', filiationType: 'biological' },
        { parentId: 'p', filiationType: 'adoption_plenary' },
      ]]]),
      getParents: () => [],
    };
    expect(linkStyle(graph, 'c', ['p'])).toBe(FILIATION_STYLE.adoption_plenary);
  });

  it('retombe sur getParents si parentsOf est absent', () => {
    const graph = { getParents: () => [{ parentId: 'p', filiationType: 'biological' }] };
    expect(linkStyle(graph, 'c', ['p'])).toBe(FILIATION_STYLE.biological);
  });
});

describe('couleurs distinctes', () => {
  it('la famille d\'accueil n\'a pas la couleur d\'une union séparée ou divorcée', () => {
    expect(FILIATION_STYLE.foster.color).not.toBe('#b45309');
    expect(FILIATION_STYLE.foster.dash).not.toBe('8 4');
  });
});
