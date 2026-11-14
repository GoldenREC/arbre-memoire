import { describe, it, expect } from 'vitest';
import { proofKindOf, eventCategoriesOf, filterSources, countSourcesByFilter } from './sourceFilters.js';

const SOURCES = [
  { id: '1', title: 'Acte de naissance — Charles Ternay', source_type: 'civil_record', eventTypes: ['birth'] },
  { id: '2', title: 'Acte de décès — Charles Ternay', source_type: 'family_data', eventTypes: ['death'] },
  { id: '3', title: 'Mention marginale — mariage', source_type: 'civil_record', eventTypes: ['marriage'] },
  { id: '4', title: 'Information familiale — mise en couple', source_type: 'family_data', eventTypes: ['union_start'] },
  { id: '5', title: 'Registre paroissial', source_type: null, repository: 'AD 19', eventTypes: [] },
  { id: '6', title: 'Livret de famille', source_type: 'civil_record', eventTypes: ['birth', 'marriage'] },
];

describe('proofKindOf', () => {
  it('distingue acte, mention marginale, information familiale et non classée', () => {
    expect(SOURCES.map(proofKindOf)).toEqual(['acte', 'family', 'marginal', 'family', 'other', 'acte']);
  });
});

describe('eventCategoriesOf', () => {
  it('range mise en couple, divorce et sources sans événement dans « autre »', () => {
    expect(eventCategoriesOf(SOURCES[3])).toEqual(['other']);
    expect(eventCategoriesOf(SOURCES[4])).toEqual(['other']);
  });
  it('une source peut prouver plusieurs événements', () => {
    expect(eventCategoriesOf(SOURCES[5])).toEqual(['birth', 'marriage']);
  });
});

describe('filterSources', () => {
  it('filtre par type de preuve', () => {
    expect(filterSources(SOURCES, { proofKind: 'family' }).map((s) => s.id)).toEqual(['2', '4']);
  });
  it("filtre par type d'événement", () => {
    expect(filterSources(SOURCES, { eventCategory: 'marriage' }).map((s) => s.id)).toEqual(['3', '6']);
  });
  it('combine les deux filtres et la recherche', () => {
    expect(filterSources(SOURCES, { proofKind: 'acte', eventCategory: 'birth', search: 'ternay' }).map((s) => s.id)).toEqual(['1']);
  });
});

describe('countSourcesByFilter', () => {
  it('compte les sources par filtre', () => {
    expect(countSourcesByFilter(SOURCES)).toEqual({
      proofKind: { acte: 2, marginal: 1, family: 2, other: 1 },
      eventCategory: { birth: 2, marriage: 2, death: 1, other: 2 },
    });
  });
});
