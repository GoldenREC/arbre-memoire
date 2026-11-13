import { describe, it, expect } from 'vitest';
import { detectDateAnomalies, detectPotentialDuplicates, detectOrphans, runFullAudit } from './auditEngine.js';

describe('detectDateAnomalies', () => {
  it('signale un décès antérieur à la naissance', () => {
    const findings = detectDateAnomalies(
      [{ id: 'a', firstNames: 'Jean', lastName: 'Dupont', birthDate: '1950-01-01', deathDate: '1940-01-01' }],
      [],
      [],
      new Map()
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('death_before_birth');
    expect(findings[0].severity).toBe('high');
    expect(findings[0].individualIds).toEqual(['a']);
  });

  it('signale un parent né après son enfant', () => {
    const individuals = [
      { id: 'parent', firstNames: 'Marie', lastName: 'Martin', birthDate: '1960-01-01' },
      { id: 'child', firstNames: 'Paul', lastName: 'Martin', birthDate: '1950-01-01' },
    ];
    const filiations = [{ id: 'f1', parentId: 'parent', childId: 'child' }];
    const findings = detectDateAnomalies(individuals, filiations, [], new Map());
    expect(findings.some((f) => f.kind === 'parent_born_after_child')).toBe(true);
  });

  it('signale un parent anormalement jeune (mais pas chronologiquement impossible)', () => {
    const individuals = [
      { id: 'parent', firstNames: 'Ana', lastName: 'Petit', birthDate: '1990-01-01' },
      { id: 'child', firstNames: 'Léo', lastName: 'Petit', birthDate: '1998-06-01' }, // ~8 ans
    ];
    const filiations = [{ id: 'f1', parentId: 'parent', childId: 'child' }];
    const findings = detectDateAnomalies(individuals, filiations, [], new Map());
    const found = findings.find((f) => f.kind === 'parent_too_young');
    expect(found).toBeTruthy();
    expect(found.severity).toBe('medium');
  });

  it('ne signale rien pour un âge parental normal', () => {
    const individuals = [
      { id: 'parent', firstNames: 'Sophie', lastName: 'Roux', birthDate: '1960-01-01' },
      { id: 'child', firstNames: 'Tom', lastName: 'Roux', birthDate: '1990-01-01' },
    ];
    const filiations = [{ id: 'f1', parentId: 'parent', childId: 'child' }];
    const findings = detectDateAnomalies(individuals, filiations, [], new Map());
    expect(findings).toHaveLength(0);
  });

  it("signale un enfant né plus de 330 jours après le décès d'un parent", () => {
    const individuals = [
      { id: 'parent', firstNames: 'Henri', lastName: 'Blanc', birthDate: '1900-01-01', deathDate: '1950-01-01' },
      { id: 'child', firstNames: 'Eva', lastName: 'Blanc', birthDate: '1952-01-01' },
    ];
    const filiations = [{ id: 'f1', parentId: 'parent', childId: 'child' }];
    const findings = detectDateAnomalies(individuals, filiations, [], new Map());
    expect(findings.some((f) => f.kind === 'child_born_after_parent_death')).toBe(true);
  });

  it('signale un mariage à un âge aberrant (trop jeune ou trop âgé)', () => {
    const individuals = [
      { id: 'young', firstNames: 'Lou', lastName: 'Vert', birthDate: '1990-01-01' },
      { id: 'old', firstNames: 'Rose', lastName: 'Gris', birthDate: '1850-01-01' },
    ];
    const unions = [{ id: 'u1', startDate: '1995-01-01' }];
    const partnersByUnion = new Map([['u1', ['young', 'old']]]);
    const findings = detectDateAnomalies(individuals, [], unions, partnersByUnion);
    const youngFinding = findings.find((f) => f.individualIds.includes('young'));
    const oldFinding = findings.find((f) => f.individualIds.includes('old'));
    expect(youngFinding.severity).toBe('high'); // ~5 ans
    expect(oldFinding.severity).toBe('medium'); // ~145 ans
  });

  it('ignore les unions ou individus sans date connue', () => {
    const individuals = [{ id: 'a', firstNames: 'X', lastName: 'Y', birthDate: null }];
    const unions = [{ id: 'u1', startDate: null }];
    expect(detectDateAnomalies(individuals, [], unions, new Map([['u1', ['a']]]))).toEqual([]);
  });
});

describe('detectPotentialDuplicates', () => {
  it('signale deux fiches au nom identique et à la même date de naissance', () => {
    const individuals = [
      { id: 'a', firstNames: 'Jean', lastName: 'Dupont', birthDate: '1900-01-01', sex: 'M' },
      { id: 'b', firstNames: 'Jean', lastName: 'Dupont', birthDate: '1900-01-01', sex: 'M' },
    ];
    const findings = detectPotentialDuplicates(individuals);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
  });

  it('tolère les accents et la casse dans la comparaison des noms', () => {
    const individuals = [
      { id: 'a', firstNames: 'José', lastName: 'Gonzàlez', birthDate: '1900-01-01' },
      { id: 'b', firstNames: 'jose', lastName: 'GONZALEZ', birthDate: '1900-06-01' },
    ];
    const findings = detectPotentialDuplicates(individuals, { yearTolerance: 1 });
    expect(findings).toHaveLength(1);
  });

  it('ne signale rien si le sexe est incompatible', () => {
    const individuals = [
      { id: 'a', firstNames: 'Camille', lastName: 'Noir', birthDate: '1900-01-01', sex: 'M' },
      { id: 'b', firstNames: 'Camille', lastName: 'Noir', birthDate: '1900-01-01', sex: 'F' },
    ];
    expect(detectPotentialDuplicates(individuals)).toEqual([]);
  });

  it('ne signale rien si les naissances sont trop éloignées', () => {
    const individuals = [
      { id: 'a', firstNames: 'Louis', lastName: 'Fabre', birthDate: '1900-01-01' },
      { id: 'b', firstNames: 'Louis', lastName: 'Fabre', birthDate: '1950-01-01' },
    ];
    expect(detectPotentialDuplicates(individuals, { yearTolerance: 2 })).toEqual([]);
  });

  it('signale en sévérité basse un même nom sans aucune date connue', () => {
    const individuals = [
      { id: 'a', firstNames: 'Alex', lastName: 'Simon', birthDate: null },
      { id: 'b', firstNames: 'Alex', lastName: 'Simon', birthDate: null },
    ];
    const findings = detectPotentialDuplicates(individuals);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
  });

  it('ignore les individus sans nom', () => {
    const individuals = [{ id: 'a', firstNames: '', lastName: '', birthDate: '1900-01-01' }];
    expect(detectPotentialDuplicates(individuals)).toEqual([]);
  });
});

describe('detectOrphans', () => {
  it('signale les individus sans filiation ni union', () => {
    const individuals = [
      { id: 'linked', firstNames: 'A', lastName: 'B' },
      { id: 'isolated', firstNames: 'C', lastName: 'D' },
    ];
    const filiations = [{ parentId: 'linked', childId: 'someone-else' }];
    const findings = detectOrphans(individuals, filiations, []);
    expect(findings).toHaveLength(1);
    expect(findings[0].individualIds).toEqual(['isolated']);
    expect(findings[0].severity).toBe('low');
  });

  it("une personne reliée seulement par une union n'est pas orpheline", () => {
    const individuals = [{ id: 'spouse', firstNames: 'E', lastName: 'F' }];
    const findings = detectOrphans(individuals, [], [{ individual_id: 'spouse' }]);
    expect(findings).toEqual([]);
  });
});

describe('runFullAudit', () => {
  it('combine les trois types de constats et trie par sévérité décroissante', () => {
    const individuals = [
      { id: 'a', firstNames: 'Jean', lastName: 'Dupont', birthDate: '1950-01-01', deathDate: '1940-01-01' }, // high
      { id: 'b', firstNames: 'Même', lastName: 'Nom', birthDate: null }, // low (orphan) + potential low duplicate needs pair
      { id: 'c', firstNames: 'Isolé', lastName: 'Seul', birthDate: '1900-01-01' }, // low (orphan)
    ];
    const result = runFullAudit({
      individuals,
      filiations: [],
      unions: [],
      partnersByUnion: new Map(),
      unionPartners: [],
    });
    expect(result.length).toBeGreaterThan(0);
    for (let i = 1; i < result.length; i++) {
      const prevRank = { high: 0, medium: 1, low: 2 }[result[i - 1].severity];
      const curRank = { high: 0, medium: 1, low: 2 }[result[i].severity];
      expect(curRank).toBeGreaterThanOrEqual(prevRank);
    }
    expect(result[0].severity).toBe('high');
  });
});
