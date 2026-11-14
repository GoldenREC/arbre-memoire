import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractJson } from './pastedAct.js';
import { validateCustomImport } from './validate.js';
import { mapCustomImportToStagingModel } from './mapper.js';

// Garde-fou : l'exemple donné à l'IA dans docs/PROMPT_ACTE.md doit rester
// importable tel quel par le site (sinon le prompt enseigne un format faux).
describe("exemple du prompt d'acte", () => {
  const doc = readFileSync(new URL('../../../docs/PROMPT_ACTE.md', import.meta.url), 'utf8');
  const model = extractJson(doc.slice(doc.indexOf('## 6. Exemple')));

  it('est un import valide', () => {
    expect(validateCustomImport(model, { availableImagePaths: new Set(['images/acte.jpg']) })).toEqual([]);
  });

  it('produit la naissance prouvée par acte, le mariage prouvé par mention marginale, et les filiations', () => {
    const staging = mapCustomImportToStagingModel(model);
    expect(staging.individuals).toHaveLength(4);
    expect(staging.filiations).toHaveLength(2);
    expect(staging.proofs.map((p) => `${p.eventType}:${p.proof.type}:${p.title}`)).toEqual([
      'birth:acte:Acte de naissance — Charles Ternay',
      'marriage:marginal:Mention marginale — mariage — Charles Ternay & Eugénie Cropet',
    ]);
    const marriage = staging.families.find((f) => f.localId === 'union-charles-eugenie');
    expect(marriage).toMatchObject({ unionType: 'marriage', startDate: null, marriageDate: '1924-04-26', splitMarriageMilestone: true });
    expect(staging.act.notes).toContain('incertaine');
  });
});

describe('événements libres', () => {
  it('enregistre un recensement comme une résidence intitulée, avec sa preuve', () => {
    const staging = mapCustomImportToStagingModel({
      individuals: [{
        localId: 'a', firstNames: 'Jean', lastName: 'Dupont',
        events: [
          { type: 'census', date: '1906-01-01', datePrecision: 'about', place: { city: 'Donzenac' }, description: 'Chef de ménage, cultivateur', proof: { type: 'acte', imageFile: 'images/acte.jpg' } },
          { type: 'military', label: 'Fiche matricule — classe 1905', date: '1906-10-08' },
        ],
      }],
    });
    expect(staging.events).toHaveLength(2);
    expect(staging.events[0]).toMatchObject({ subjectLocalId: 'a', eventType: 'residence', label: 'Recensement 1906', description: 'Chef de ménage, cultivateur', title: 'Recensement 1906 — Jean Dupont' });
    expect(staging.events[0].placeLocalId).toBeTruthy();
    expect(staging.events[1]).toMatchObject({ eventType: 'military', datePrecision: 'exact', proof: null });
  });

  it("refuse un type d'événement inconnu et une mention marginale sans image", () => {
    const errors = validateCustomImport({
      individuals: [{ localId: 'a', events: [{ type: 'voyage' }], birth: { proof: { type: 'marginal' } } }],
    });
    expect(errors.some((e) => e.includes('events[0].type'))).toBe(true);
    expect(errors.some((e) => e.includes('"marginal" nécessite'))).toBe(true);
  });
});
