import { describe, it, expect } from 'vitest';
import { buildUnionReviewRows, summarizeUnionReview } from './unionReview.js';

function bundle() {
  return {
    individuals: [
      { id: 'a', firstNames: 'Charles', lastName: 'Ternay' },
      { id: 'b', firstNames: 'Eugénie', lastName: 'Cropet' },
      { id: 'c', firstNames: 'Albert', lastName: 'Rougier' },
      { id: 'd', firstNames: 'Zoé', lastName: 'Martin' },
    ],
    unions: [
      { id: 'u-proven', unionType: 'marriage', status: 'ongoing', startDate: '1920-01-01', placeId: 'p1' },
      { id: 'u-suspect', unionType: 'marriage', status: 'ongoing', startDate: '1950-01-01', placeId: null },
      { id: 'u-couple', unionType: 'cohabitation', status: 'ongoing', startDate: '2023-01-01', placeId: null },
    ],
    partnersByUnion: new Map([['u-proven', ['a', 'b']], ['u-suspect', ['c', 'd']], ['u-couple', ['a', 'd']]]),
    events: [
      { id: 'e1', subjectKind: 'union', subjectId: 'u-proven', eventType: 'marriage', date: '1930-05-05', datePrecision: 'exact', placeId: 'p2' },
      { id: 'e2', subjectKind: 'union', subjectId: 'u-suspect', eventType: 'marriage', date: '1950-01-01', datePrecision: 'exact', placeId: null },
      { id: 'e3', subjectKind: 'individual', subjectId: 'a', eventType: 'birth', date: '1905-02-23' },
    ],
    citations: [{ id: 'c1', sourceId: 's1', eventId: 'e1' }],
    placesById: new Map([['p1', 'Donzenac'], ['p2', 'Paris']]),
  };
}

describe('buildUnionReviewRows', () => {
  it('signale un mariage sans preuve et le place en tête de liste', () => {
    const rows = buildUnionReviewRows(bundle());
    expect(rows[0].union.id).toBe('u-suspect');
    expect(rows[0].suspect).toBe(true);
    expect(rows[0].partnerNames).toEqual(['Albert Rougier', 'Zoé Martin']);
  });

  it('ne signale pas un mariage prouvé, et affiche la date et le lieu du mariage', () => {
    const row = buildUnionReviewRows(bundle()).find((r) => r.union.id === 'u-proven');
    expect(row.suspect).toBe(false);
    expect(row.hasMarriageProof).toBe(true);
    expect(row.date).toBe('1930-05-05');
    expect(row.placeLabel).toBe('Paris');
  });

  it("ne signale jamais une union « en couple », et affiche sa date de mise en couple", () => {
    const row = buildUnionReviewRows(bundle()).find((r) => r.union.id === 'u-couple');
    expect(row.status).toBe('couple');
    expect(row.suspect).toBe(false);
    expect(row.date).toBe('2023-01-01');
  });
});

describe('summarizeUnionReview', () => {
  it('compte les unions par statut et celles à vérifier', () => {
    expect(summarizeUnionReview(buildUnionReviewRows(bundle()))).toEqual({ total: 3, couple: 1, married: 2, divorced: 0, suspect: 1 });
  });
});
