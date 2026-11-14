import { describe, it, expect, vi } from 'vitest';
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: {} }));
import { recordPatchForEvent, placeWasEdited } from './eventQuickEdit.js';

const values = { date: '1972-12-01', datePrecision: 'exact', placeId: 'p1' };

describe('recordPatchForEvent', () => {
  it('reporte naissance et décès sur la fiche de la personne', () => {
    expect(recordPatchForEvent({ subjectKind: 'individual', eventType: 'birth' }, values)).toEqual({
      table: 'individuals', patch: { birth_date: '1972-12-01', birth_date_precision: 'exact', birth_place_id: 'p1' },
    });
    expect(recordPatchForEvent({ subjectKind: 'individual', eventType: 'death' }, values).patch).toHaveProperty('death_place_id', 'p1');
  });

  it("reporte mise en couple et divorce sur l'union", () => {
    expect(recordPatchForEvent({ subjectKind: 'union', eventType: 'union_start' }, values).patch).toEqual({ start_date: '1972-12-01', start_date_precision: 'exact', place_id: 'p1' });
    expect(recordPatchForEvent({ subjectKind: 'union', eventType: 'divorce' }, values).patch).toEqual({ end_date: '1972-12-01', end_date_precision: 'exact' });
  });

  it('ne touche pas la fiche pour un mariage, une résidence, etc.', () => {
    expect(recordPatchForEvent({ subjectKind: 'union', eventType: 'marriage' }, values)).toBeNull();
    expect(recordPatchForEvent({ subjectKind: 'individual', eventType: 'residence' }, values)).toBeNull();
  });

  it('date vidée : null et précision inconnue', () => {
    expect(recordPatchForEvent({ subjectKind: 'individual', eventType: 'birth' }, { date: '', placeId: null }).patch).toEqual({ birth_date: null, birth_date_precision: 'unknown', birth_place_id: null });
  });
});

describe('placeWasEdited', () => {
  it('ignore les espaces, détecte un vrai changement', () => {
    expect(placeWasEdited({ city: 'Limoges', country: '' }, { city: 'Limoges ', country: '' })).toBe(false);
    expect(placeWasEdited({ city: '', country: '' }, { city: 'Limoges', country: 'France' })).toBe(true);
  });
});
