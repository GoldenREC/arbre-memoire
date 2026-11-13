import { describe, it, expect } from 'vitest';
import {
  ageReached,
  buildAgePyramid,
  lifeExpectancyByPeriod,
  marriageAgeStats,
  parenthoodAgeStats,
  birthsAndDeathsByDecade,
  detectMortalityPeaks,
  topNames,
  topPlaces,
  migrationFlows,
  completenessCriteria,
  completeness,
  completenessByGeneration,
  buildGenerationGraph,
} from './statsEngine.js';

describe('ageReached', () => {
  it("calcule l'âge au décès pour une personne décédée datée", () => {
    expect(ageReached({ isDeceased: true, birthDate: '1900-01-01', deathDate: '1970-06-15' })).toBe(70);
  });
  it('retourne null sans date de naissance ou de décès connue', () => {
    expect(ageReached({ isDeceased: true, birthDate: null, deathDate: '1970-01-01' })).toBeNull();
    expect(ageReached({ isDeceased: false, birthDate: null })).toBeNull();
  });
});

describe('buildAgePyramid', () => {
  const individuals = [
    { sex: 'M', isDeceased: true, birthDate: '1900-01-01', deathDate: '1925-01-01' }, // 25 ans
    { sex: 'F', isDeceased: true, birthDate: '1900-01-01', deathDate: '1975-01-01' }, // 75 ans
    { sex: 'M', isDeceased: true, birthDate: '1900-01-01', deathDate: '1922-01-01' }, // 22 ans -> même tranche 20-29
  ];

  it('regroupe par tranche de 10 ans et par sexe', () => {
    const rows = buildAgePyramid(individuals);
    const band20 = rows.find((r) => r.label === '20-29');
    expect(band20.M).toBe(2);
    const band70 = rows.find((r) => r.label === '70-79');
    expect(band70.F).toBe(1);
  });

  it('filtre par siècle de naissance', () => {
    const withCentury = [...individuals, { sex: 'M', isDeceased: true, birthDate: '1800-01-01', deathDate: '1850-01-01' }];
    const rows = buildAgePyramid(withCentury, { centuryStart: 1900 });
    const total = rows.reduce((s, r) => s + r.total, 0);
    expect(total).toBe(3); // exclut la personne née en 1800
  });
});

describe('lifeExpectancyByPeriod', () => {
  it('moyenne l\'âge au décès par siècle de naissance', () => {
    const individuals = [
      { birthDate: '1810-01-01', deathDate: '1850-01-01' }, // 40
      { birthDate: '1850-01-01', deathDate: '1900-01-01' }, // 50
      { birthDate: '1910-01-01', deathDate: '1990-01-01' }, // 80
    ];
    const result = lifeExpectancyByPeriod(individuals, 100);
    expect(result).toEqual([
      { period: 1800, avgAge: 45, count: 2 },
      { period: 1900, avgAge: 80, count: 1 },
    ]);
  });

  it('ignore les individus sans date de naissance ou de décès', () => {
    expect(lifeExpectancyByPeriod([{ birthDate: '1900-01-01', deathDate: null }], 100)).toEqual([]);
  });
});

describe('marriageAgeStats', () => {
  it('calcule l\'âge moyen au mariage par sexe et l\'écart entre conjoints', () => {
    const individuals = [
      { id: 'h1', sex: 'M', birthDate: '1900-01-01' }, // 25 ans au mariage
      { id: 'f1', sex: 'F', birthDate: '1905-01-01' }, // 20 ans au mariage
    ];
    const unions = [{ id: 'u1', startDate: '1925-01-01' }];
    const partnersByUnion = new Map([['u1', ['h1', 'f1']]]);
    const result = marriageAgeStats(individuals, unions, partnersByUnion);
    expect(result.male).toBe(25);
    expect(result.female).toBe(20);
    expect(result.overall).toBe(22.5);
    expect(result.averageSpouseGap).toBe(5);
  });

  it('sans date de mariage, aucune union ne compte', () => {
    const result = marriageAgeStats([], [{ id: 'u1', startDate: null }], new Map());
    expect(result.count).toBe(0);
    expect(result.overall).toBeNull();
  });
});

describe('parenthoodAgeStats', () => {
  it('sépare paternité et maternité, et écarte les âges biologiquement improbables', () => {
    const individuals = [
      { id: 'father', sex: 'M', birthDate: '1900-01-01' },
      { id: 'mother', sex: 'F', birthDate: '1905-01-01' },
      { id: 'child', birthDate: '1930-01-01' }, // père 30 ans, mère 25 ans
      { id: 'tooyoung', sex: 'M', birthDate: '1990-01-01' },
      { id: 'child2', birthDate: '1995-01-01' }, // 5 ans -> écarté
    ];
    const filiations = [
      { filiationType: 'biological', parentId: 'father', childId: 'child' },
      { filiationType: 'biological', parentId: 'mother', childId: 'child' },
      { filiationType: 'biological', parentId: 'tooyoung', childId: 'child2' },
    ];
    const result = parenthoodAgeStats(individuals, filiations);
    expect(result.father).toBe(30);
    expect(result.mother).toBe(25);
    expect(result.fatherCount).toBe(1); // le cas "tooyoung" (5 ans) est écarté
  });
});

describe('birthsAndDeathsByDecade / detectMortalityPeaks', () => {
  it('compte naissances et décès par décennie', () => {
    const individuals = [
      { birthDate: '1900-05-01', deathDate: '1950-01-01' },
      { birthDate: '1901-01-01', deathDate: null },
    ];
    const result = birthsAndDeathsByDecade(individuals);
    expect(result.find((d) => d.decade === 1900).births).toBe(2);
    expect(result.find((d) => d.decade === 1950).deaths).toBe(1);
  });

  it('repère une décennie avec un pic de décès net', () => {
    const byDecade = [
      { decade: 1900, deaths: 2 }, { decade: 1910, deaths: 3 }, { decade: 1920, deaths: 20 }, { decade: 1930, deaths: 2 },
    ];
    const peaks = detectMortalityPeaks(byDecade);
    expect(peaks).toHaveLength(1);
    expect(peaks[0].decade).toBe(1920);
  });

  it('ne signale rien sur une série trop courte ou plate', () => {
    expect(detectMortalityPeaks([{ decade: 1900, deaths: 2 }])).toEqual([]);
    expect(detectMortalityPeaks([{ decade: 1900, deaths: 2 }, { decade: 1910, deaths: 2 }, { decade: 1920, deaths: 2 }])).toEqual([]);
  });
});

describe('topNames', () => {
  it('éclate les prénoms composés en jetons et compte chacun', () => {
    const individuals = [
      { firstNames: 'Jean Marie', birthDate: '1900-01-01' },
      { firstNames: 'Jean', birthDate: '1950-01-01' },
      { firstNames: 'Marie', birthDate: '1920-01-01' },
    ];
    const result = topNames(individuals, 'firstNames');
    const jean = result.find((r) => r.name === 'Jean');
    expect(jean.count).toBe(2);
    expect(jean.firstYear).toBe(1900);
    expect(jean.lastYear).toBe(1950);
  });

  it('ne découpe pas les patronymes', () => {
    const individuals = [{ firstNames: 'x', lastName: 'Dupont Martin', birthDate: '1900-01-01' }];
    const result = topNames(individuals, 'lastName');
    expect(result[0].name).toBe('Dupont Martin');
  });
});

describe('topPlaces', () => {
  const placesById = new Map([['p1', 'Grasse'], ['p2', 'Nice']]);
  it('compte les lieux de naissance', () => {
    const individuals = [{ birthPlaceId: 'p1' }, { birthPlaceId: 'p1' }, { birthPlaceId: 'p2' }];
    const result = topPlaces(individuals, [], placesById, 'birth');
    expect(result[0]).toEqual({ label: 'Grasse', count: 2 });
  });
  it("compte les lieux d'un type d'événement", () => {
    const events = [{ eventType: 'occupation', placeId: 'p2' }, { eventType: 'occupation', placeId: 'p2' }];
    const result = topPlaces([], events, placesById, 'occupation');
    expect(result[0]).toEqual({ label: 'Nice', count: 2 });
  });
});

describe('migrationFlows', () => {
  it('agrège les trajets naissance -> décès identiques', () => {
    const placesById = new Map([['a', 'Grasse'], ['b', 'Lima']]);
    const individuals = [
      { birthPlaceId: 'a', deathPlaceId: 'b' },
      { birthPlaceId: 'a', deathPlaceId: 'b' },
      { birthPlaceId: 'a', deathPlaceId: 'a' }, // même lieu -> ignoré
    ];
    const result = migrationFlows(individuals, placesById);
    expect(result).toEqual([{ from: 'Grasse', to: 'Lima', count: 2 }]);
  });
});

describe('completenessCriteria / completeness', () => {
  const nmdStatus = { birth: { hasAct: true }, death: { hasAct: false }, marriage: { hasAct: false, options: [] } };

  it('une fiche complète (vivante, naissance exacte+lieu+photo+acte) obtient les 4 critères', () => {
    const ind = { isDeceased: false, birthDate: '1990-01-01', birthDatePrecision: 'exact', birthPlaceId: 'p1' };
    const c = completenessCriteria(ind, true, nmdStatus);
    expect(c).toEqual({ hasExactBirth: true, hasBirthPlace: true, hasPhoto: true, hasAct: true });
  });

  it('calcule le pourcentage global sur plusieurs fiches', () => {
    const individuals = [
      { id: '1', isDeceased: false, birthDate: '1990-01-01', birthDatePrecision: 'exact', birthPlaceId: 'p1' },
      { id: '2', isDeceased: false, birthDate: null, birthDatePrecision: 'unknown', birthPlaceId: null },
    ];
    const nmdByInd = new Map([['1', nmdStatus], ['2', { birth: { hasAct: false }, death: { hasAct: false }, marriage: { hasAct: false, options: [] } }]]);
    const result = completeness(individuals, new Set(['1']), nmdByInd);
    expect(result.count).toBe(2);
    expect(result.criteria.exactBirthDate).toBe(50);
    expect(result.criteria.photo).toBe(50);
  });
});

describe('completenessByGeneration', () => {
  // Petit graphe fictif : grand-parent -> parent -> enfant (racine = parent)
  function makeGraph() {
    const individuals = new Map([
      ['gp', { id: 'gp', isDeceased: true, birthDate: '1900-01-01', birthDatePrecision: 'exact', birthPlaceId: 'p1' }],
      ['parent', { id: 'parent', isDeceased: false, birthDate: '1930-01-01', birthDatePrecision: 'about', birthPlaceId: null }],
      ['child', { id: 'child', isDeceased: false, birthDate: '1960-01-01', birthDatePrecision: 'exact', birthPlaceId: 'p1' }],
    ]);
    return {
      getIndividual: (id) => individuals.get(id) || null,
      getParents: (id) => (id === 'parent' ? [{ parentId: 'gp' }] : []),
      getChildren: (id) => (id === 'parent' ? ['child'] : []),
    };
  }

  it('classe les individus par génération relative à la racine', () => {
    const graph = makeGraph();
    const nmdByInd = new Map();
    for (const id of ['gp', 'parent', 'child']) {
      nmdByInd.set(id, { birth: { hasAct: false }, death: { hasAct: false }, marriage: { hasAct: false, options: [] } });
    }
    const rows = completenessByGeneration(graph, 'parent', new Set(), nmdByInd);
    expect(rows.map((r) => r.generation)).toEqual([-1, 0, 1]);
    expect(rows.find((r) => r.generation === -1).count).toBe(1);
  });
});

describe('buildGenerationGraph', () => {
  it('construit parents/enfants à partir de filiations brutes', () => {
    const individuals = [{ id: 'gp' }, { id: 'parent' }, { id: 'child' }];
    const filiations = [
      { childId: 'parent', parentId: 'gp' },
      { childId: 'child', parentId: 'parent' },
    ];
    const graph = buildGenerationGraph(individuals, filiations);
    expect(graph.getParents('parent')).toEqual([{ parentId: 'gp' }]);
    expect(graph.getChildren('parent')).toEqual(['child']);
    expect(graph.getIndividual('gp')).toEqual({ id: 'gp' });
    expect(graph.getParents('gp')).toEqual([]);
  });
});
