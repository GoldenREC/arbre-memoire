import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabaseClient.js', () => ({ supabase: {} }));
const { proofLevelOfSource, proofLevelFromSources, raisedProofLevel, planProofLevelUpdates } = await import('./proofLevelSync.js');

describe('proofLevelOfSource', () => {
  it('suit la même échelle que le formulaire de preuve', () => {
    expect(proofLevelOfSource({ sourceType: 'civil_record', hasMedia: true })).toBe('proven_original');
    expect(proofLevelOfSource({ sourceType: 'civil_record', url: 'https://archives.example.org/a' })).toBe('proven_secondary');
    expect(proofLevelOfSource({ sourceType: 'civil_record', title: 'Mention marginale — mariage', hasMedia: true })).toBe('proven_secondary');
    expect(proofLevelOfSource({ sourceType: 'family_data' })).toBe('probable');
    expect(proofLevelOfSource({ sourceType: 'civil_record' })).toBeNull(); // acte sans scan ni lien : rien de vérifiable
    expect(proofLevelOfSource({ sourceType: null, hasMedia: true })).toBeNull();
  });
});

describe('raisedProofLevel', () => {
  it("relève l'indice mais ne l'abaisse jamais, et ne touche pas à « Réfuté »", () => {
    expect(raisedProofLevel('hypothesis', 'proven_original')).toBe('proven_original');
    expect(raisedProofLevel('proven_original', 'probable')).toBeNull();
    expect(raisedProofLevel('probable', 'probable')).toBeNull();
    expect(raisedProofLevel('disproved', 'proven_original')).toBeNull();
    expect(raisedProofLevel('hypothesis', null)).toBeNull();
  });
});

describe('planProofLevelUpdates', () => {
  it("relève un décès resté en hypothèse alors qu'un acte scanné y est rattaché", () => {
    const updates = planProofLevelUpdates({
      events: [{ id: 'e1', proof_level: 'hypothesis' }, { id: 'e2', proof_level: 'hypothesis' }, { id: 'e3', proof_level: 'proven_original' }],
      citations: [{ event_id: 'e1', source_id: 's1' }, { event_id: 'e1', source_id: 's2' }, { event_id: 'e3', source_id: 's2' }],
      sources: [{ id: 's1', title: 'Acte de décès', source_type: 'civil_record', url: null }, { id: 's2', title: 'Info', source_type: 'family_data' }],
      mediaSourceIds: new Set(['s1']),
    });
    expect(updates).toEqual([{ eventId: 'e1', proofLevel: 'proven_original' }]);
    expect(proofLevelFromSources([])).toBeNull();
  });
});
