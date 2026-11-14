import { describe, it, expect } from 'vitest';
import { validateCustomImport } from './validate.js';

function baseModel() {
  return {
    formatVersion: '1.0',
    individuals: [
      { localId: 'p1', firstNames: 'Jean', lastName: 'Durand', sex: 'M' },
    ],
  };
}

describe('validateCustomImport', () => {
  it("accepte un modèle minimal valide", () => {
    expect(validateCustomImport(baseModel())).toEqual([]);
  });

  it("refuse un fichier qui n'est pas un objet", () => {
    expect(validateCustomImport(null)).not.toEqual([]);
    expect(validateCustomImport('texte')).not.toEqual([]);
  });

  it("exige au moins un individu", () => {
    const errors = validateCustomImport({ individuals: [] });
    expect(errors.some((e) => e.includes('individuals'))).toBe(true);
  });

  it('signale un localId manquant', () => {
    const errors = validateCustomImport({ individuals: [{ firstNames: 'Jean' }] });
    expect(errors.some((e) => e.includes('localId'))).toBe(true);
  });

  it('signale des localId dupliqués', () => {
    const errors = validateCustomImport({
      individuals: [{ localId: 'p1' }, { localId: 'p1' }],
    });
    expect(errors.some((e) => e.includes('"p1"') && e.includes('plusieurs fois'))).toBe(true);
  });

  it('signale une référence "parents" introuvable', () => {
    const model = baseModel();
    model.individuals[0].parents = ['inconnu'];
    const errors = validateCustomImport(model);
    expect(errors.some((e) => e.includes('parents') && e.includes('inconnu'))).toBe(true);
  });

  it('signale un "null" dans "parents" (parent inconnu mal représenté) avec un message explicite', () => {
    const model = {
      individuals: [
        { localId: 'enfant', parents: [null, 'mere'] },
        { localId: 'mere' },
      ],
    };
    const errors = validateCustomImport(model);
    expect(errors.some((e) => e.includes('.parents') && e.includes('parent inconnu'))).toBe(true);
  });

  it('accepte un parent sous forme { id, filiationType } pour une filiation adoptive', () => {
    const model = {
      individuals: [
        { localId: 'enfant', parents: ['mere', { id: 'beau-pere', filiationType: 'adoption_simple' }] },
        { localId: 'mere' },
        { localId: 'beau-pere' },
      ],
    };
    const errors = validateCustomImport(model);
    expect(errors).toEqual([]);
  });

  it('signale un filiationType invalide sur un parent objet', () => {
    const model = {
      individuals: [
        { localId: 'enfant', parents: [{ id: 'pere', filiationType: 'martien' }] },
        { localId: 'pere' },
      ],
    };
    const errors = validateCustomImport(model);
    expect(errors.some((e) => e.includes('filiationType') && e.includes('martien'))).toBe(true);
  });

  it('signale un parent objet référençant un localId introuvable', () => {
    const model = {
      individuals: [{ localId: 'enfant', parents: [{ id: 'inconnu', filiationType: 'foster' }] }],
    };
    const errors = validateCustomImport(model);
    expect(errors.some((e) => e.includes('parents') && e.includes('inconnu'))).toBe(true);
  });

  it('accepte une référence "parents" valide', () => {
    const model = {
      individuals: [
        { localId: 'enfant', parents: ['pere'] },
        { localId: 'pere' },
      ],
    };
    expect(validateCustomImport(model)).toEqual([]);
  });

  it('refuse un sexe invalide', () => {
    const model = baseModel();
    model.individuals[0].sex = 'X';
    expect(validateCustomImport(model).some((e) => e.includes('.sex'))).toBe(true);
  });

  it('refuse une datePrecision invalide', () => {
    const model = baseModel();
    model.individuals[0].birth = { date: '1900-01-01', datePrecision: 'bientot' };
    expect(validateCustomImport(model).some((e) => e.includes('datePrecision'))).toBe(true);
  });

  it('refuse une date mal formée', () => {
    const model = baseModel();
    model.individuals[0].birth = { date: '12/01/1900' };
    expect(validateCustomImport(model).some((e) => e.includes('.date'))).toBe(true);
  });

  it('refuse une preuve "acte" sans url ni imageFile', () => {
    const model = baseModel();
    model.individuals[0].birth = { date: '1900-01-01', datePrecision: 'exact', proof: { type: 'acte' } };
    expect(validateCustomImport(model).some((e) => e.includes('nécessite "url" ou "imageFile"'))).toBe(true);
  });

  it('accepte une preuve "family" sans url ni imageFile', () => {
    const model = baseModel();
    model.individuals[0].birth = { date: '1900-01-01', datePrecision: 'exact', proof: { type: 'family' } };
    expect(validateCustomImport(model)).toEqual([]);
  });

  it('signale une imageFile absente du zip quand availableImagePaths est fourni', () => {
    const model = baseModel();
    model.individuals[0].birth = {
      date: '1900-01-01', datePrecision: 'exact',
      proof: { type: 'acte', imageFile: 'images/manquant.jpg' },
    };
    const errors = validateCustomImport(model, { availableImagePaths: new Set(['images/autre.jpg']) });
    expect(errors.some((e) => e.includes('absent du .zip'))).toBe(true);
  });

  it('accepte une imageFile présente dans availableImagePaths', () => {
    const model = baseModel();
    model.individuals[0].birth = {
      date: '1900-01-01', datePrecision: 'exact',
      proof: { type: 'acte', imageFile: 'images/acte.jpg' },
    };
    const errors = validateCustomImport(model, { availableImagePaths: new Set(['images/acte.jpg']) });
    expect(errors).toEqual([]);
  });

  it('ignore death quand isDeceased est faux ou absent', () => {
    const model = baseModel();
    model.individuals[0].death = { date: 'pas-une-date' }; // serait invalide si vérifié
    expect(validateCustomImport(model)).toEqual([]);
  });

  it('valide death quand isDeceased est vrai', () => {
    const model = baseModel();
    model.individuals[0].isDeceased = true;
    model.individuals[0].death = { date: 'pas-une-date' };
    expect(validateCustomImport(model).some((e) => e.includes('death.date'))).toBe(true);
  });

  it('exige au moins 2 partners pour une union', () => {
    const model = baseModel();
    model.unions = [{ localId: 'u1', partners: ['p1'] }];
    expect(validateCustomImport(model).some((e) => e.includes('.partners'))).toBe(true);
  });

  it('accepte une union valide avec 2 partenaires connus', () => {
    const model = {
      individuals: [{ localId: 'p1' }, { localId: 'p2' }],
      unions: [{ localId: 'u1', partners: ['p1', 'p2'], status: 'ongoing' }],
    };
    expect(validateCustomImport(model)).toEqual([]);
  });

  it('refuse un status d\'union invalide', () => {
    const model = {
      individuals: [{ localId: 'p1' }, { localId: 'p2' }],
      unions: [{ localId: 'u1', partners: ['p1', 'p2'], status: 'fiancés' }],
    };
    expect(validateCustomImport(model).some((e) => e.includes('.status'))).toBe(true);
  });

  it('refuse un endDate mal formé sur une union', () => {
    const model = {
      individuals: [{ localId: 'p1' }, { localId: 'p2' }],
      unions: [{ localId: 'u1', partners: ['p1', 'p2'], status: 'divorced', endDate: '07/06/1948' }],
    };
    expect(validateCustomImport(model).some((e) => e.includes('.endDate'))).toBe(true);
  });

  it('refuse un endDatePrecision invalide sur une union', () => {
    const model = {
      individuals: [{ localId: 'p1' }, { localId: 'p2' }],
      unions: [{ localId: 'u1', partners: ['p1', 'p2'], status: 'divorced', endDate: '1948-06-07', endDatePrecision: 'peut-etre' }],
    };
    expect(validateCustomImport(model).some((e) => e.includes('.endDatePrecision'))).toBe(true);
  });

  it('accepte endDate/endDatePrecision valides sur une union divorcée', () => {
    const model = {
      individuals: [{ localId: 'p1' }, { localId: 'p2' }],
      unions: [{ localId: 'u1', partners: ['p1', 'p2'], status: 'divorced', endDate: '1948-06-07', endDatePrecision: 'exact' }],
    };
    expect(validateCustomImport(model)).toEqual([]);
  });

  it('refuse un divorceProof "acte" sans url ni imageFile', () => {
    const model = {
      individuals: [{ localId: 'p1' }, { localId: 'p2' }],
      unions: [{
        localId: 'u1', partners: ['p1', 'p2'], status: 'divorced', endDate: '1948-06-07',
        divorceProof: { type: 'acte' },
      }],
    };
    expect(validateCustomImport(model).some((e) => e.includes('divorceProof') && e.includes('nécessite "url" ou "imageFile"'))).toBe(true);
  });

  it('accepte un divorceProof "family"', () => {
    const model = {
      individuals: [{ localId: 'p1' }, { localId: 'p2' }],
      unions: [{
        localId: 'u1', partners: ['p1', 'p2'], status: 'divorced', endDate: '1948-06-07',
        divorceProof: { type: 'family', transcription: 'Jugement du 07/06/1948.' },
      }],
    };
    expect(validateCustomImport(model)).toEqual([]);
  });
});
