import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabaseClient.js', () => ({ supabase: {} }));
const { describeEventVersions, pickBestEvent } = await import('./auditCorrections.js');

function bundle() {
  return {
    individuals: [{ id: 'a', birthDate: '1897-01-05', birthPlaceId: 'p1' }],
    events: [
      { id: 'e1', subjectKind: 'individual', subjectId: 'a', eventType: 'birth', date: '1897-01-05', datePrecision: 'exact', placeId: 'p2', proofLevel: 'proven_original' },
      { id: 'e2', subjectKind: 'individual', subjectId: 'a', eventType: 'birth', date: '1897-01-05', datePrecision: 'exact', placeId: 'p1', proofLevel: 'hypothesis' },
    ],
    placesById: new Map([['p1', 'Châteauponsac'], ['p2', 'Châteauneuf-la-Forêt']]),
    citations: [{ sourceId: 's1', eventId: 'e1', hasMedia: true }, { sourceId: 's1', eventId: 'e1', hasMedia: true }, { sourceId: 's2', eventId: 'e2', hasMedia: false }],
    sources: [
      { id: 's1', title: 'Acte de naissance', repository: 'Archives de Châteauneuf-la-Forêt', callNumber: 'n°1', sourceType: 'civil_record' },
      { id: 's2', title: 'Acte de naissance', repository: 'Archives de Châteauponsac', callNumber: 'n°1', sourceType: 'civil_record' },
    ],
  };
}

describe('describeEventVersions', () => {
  it('décrit chaque version avec son lieu, ses sources (sans répétition) et ce qui diffère', () => {
    const { versions, differs } = describeEventVersions(['e1', 'e2'], bundle());
    expect(versions.map((v) => v.placeLabel)).toEqual(['Châteauneuf-la-Forêt', 'Châteauponsac']);
    expect(versions[0].sources).toHaveLength(1);
    expect(versions[0].sources[0].hasMedia).toBe(true);
    expect(differs).toEqual({ date: false, place: true, proof: true });
  });

  it('repère la version qui correspond à la fiche', () => {
    const { versions } = describeEventVersions(['e1', 'e2'], bundle());
    expect(versions.map((v) => v.onRecord)).toEqual([false, true]);
  });
});

describe('pickBestEvent', () => {
  it('préfère la version affichée sur la fiche, même moins bien prouvée', () => {
    const { versions } = describeEventVersions(['e1', 'e2'], bundle());
    expect(pickBestEvent(versions).event.id).toBe('e2');
  });

  it('sinon préfère la mieux prouvée', () => {
    const b = bundle();
    b.individuals[0].birthPlaceId = 'ailleurs';
    expect(pickBestEvent(describeEventVersions(['e1', 'e2'], b).versions).event.id).toBe('e1');
  });
});

describe('versionChoices / bestProofLevel', () => {
  it('propose chaque lieu et chaque date une seule fois, et le meilleur niveau de preuve', async () => {
    const { versionChoices, bestProofLevel } = await import('./auditCorrections.js');
    const { versions } = describeEventVersions(['e1', 'e2'], bundle());
    const choices = versionChoices(versions);
    expect(choices.places.map((p) => p.label)).toEqual(['Châteauneuf-la-Forêt', 'Châteauponsac']);
    expect(choices.places[1].placeId).toBe('p1');
    expect(choices.dates).toHaveLength(1);
    expect(bestProofLevel(versions)).toBe('proven_original');
  });
});
