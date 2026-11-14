import { describe, it, expect } from 'vitest';
import { renderFamilyBooklet } from './pdfBooklet.js';

// Garde-fou de version : vérifie que la bibliothèque PDF produit bien un
// document à partir d'un petit arbre (à relancer à chaque mise à jour de jsPDF).
describe('renderFamilyBooklet', () => {
  it('produit un PDF non vide avec une page de couverture et les fiches', () => {
    const snapshot = {
      individuals: [
        { id: 'a', firstNames: 'Jean', lastName: 'Dupont', sex: 'M', birthDate: '1900-01-01', birthDatePrecision: 'exact', deathDate: '1970-01-01', deathDatePrecision: 'exact', isDeceased: true },
        { id: 'b', firstNames: 'Marie', lastName: 'Martin', sex: 'F', birthDate: '1902-03-04', birthDatePrecision: 'exact', isDeceased: true },
      ],
      unions: [{ id: 'u', unionType: 'marriage', status: 'ongoing', startDate: '1925-06-01', startDatePrecision: 'exact', partners: [{ individualId: 'a' }, { individualId: 'b' }] }],
      filiations: [],
      places: [],
      placesById: new Map(),
      events: [],
      sources: [],
      citations: [],
      media: [],
    };
    const doc = renderFamilyBooklet(snapshot, { maskLiving: false });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    const bytes = doc.output('arraybuffer');
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(new Uint8Array(bytes).slice(0, 5))).toBe('%PDF-');
  });
});
