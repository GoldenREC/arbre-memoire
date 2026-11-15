import { describe, it, expect, vi } from 'vitest';
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: {} }));
import { planJanuaryFirstFix, countPlan } from './januaryFirstDates.js';

describe('planJanuaryFirstFix', () => {
  const individuals = [
    { id: 'i1', birth_date: '1829-01-01', birth_date_precision: 'exact', death_date: '1890-03-12', death_date_precision: 'exact' },
    { id: 'i2', birth_date: '1900-01-01', birth_date_precision: 'exact', death_date: '1970-01-01', death_date_precision: 'about' },
    { id: 'i3', birth_date: '1850-06-01', birth_date_precision: 'exact' },
  ];
  const events = [
    { id: 'e1', subject_kind: 'individual', subject_id: 'i1', event_type: 'birth', event_date: '1829-01-01', date_precision: 'exact' },
    { id: 'e2', subject_kind: 'individual', subject_id: 'i2', event_type: 'birth', event_date: '1900-01-01', date_precision: 'exact' },
  ];
  const unions = [{ id: 'u1', start_date: '1855-01-01', start_date_precision: 'exact', end_date: null, end_date_precision: 'unknown' }];
  const plan = planJanuaryFirstFix({ individuals, unions, events, citedEventIds: new Set(['e2']) });

  it('corrige les 1er janvier "exacts" sans preuve', () => {
    expect(plan.birthIds).toEqual(['i1']);
    expect(plan.eventIds).toEqual(['e1']);
    expect(plan.unionStartIds).toEqual(['u1']);
  });

  it("laisse un 1er janvier appuyé par un acte, et tout ce qui n'est pas un 1er janvier exact", () => {
    expect(plan.birthIds).not.toContain('i2');
    expect(plan.deathIds).toEqual([]);
    expect(countPlan(plan)).toBe(3);
  });
});
