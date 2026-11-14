import { describe, it, expect } from 'vitest';
import { mapCustomImportToStagingModel } from './mapper.js';

describe('mapCustomImportToStagingModel', () => {
  it('mappe un individu simple sans lieu ni preuve', () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{ localId: 'p1', firstNames: 'Jean', lastName: 'Durand', sex: 'M' }],
    });
    expect(model.individuals).toEqual([
      expect.objectContaining({
        localId: 'p1', firstNames: 'Jean', lastName: 'Durand', sex: 'M',
        birthDate: null, birthDatePrecision: 'unknown', birthPlaceLocalId: null,
        isDeceased: false,
      }),
    ]);
    expect(model.places).toEqual([]);
    expect(model.proofs).toEqual([]);
  });

  it('enregistre le lieu structuré de naissance et le relie à la fiche', () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{
        localId: 'p1',
        birth: { date: '1900-01-01', datePrecision: 'exact', place: { city: 'Grasse', country: 'France' } },
      }],
    });
    expect(model.places).toHaveLength(1);
    expect(model.places[0].structured).toEqual(expect.objectContaining({ city: 'Grasse', country: 'France' }));
    expect(model.individuals[0].birthPlaceLocalId).toBe(model.places[0].localId);
  });

  it('déduplique un même lieu réutilisé par plusieurs personnes (fratrie)', () => {
    const place = { city: 'Grasse', postalCode: '06130', country: 'France' };
    const model = mapCustomImportToStagingModel({
      individuals: [
        { localId: 'enfant1', birth: { date: '1900-01-01', datePrecision: 'exact', place } },
        { localId: 'enfant2', birth: { date: '1902-01-01', datePrecision: 'exact', place } },
      ],
    });
    expect(model.places).toHaveLength(1);
    expect(model.individuals[0].birthPlaceLocalId).toBe(model.individuals[1].birthPlaceLocalId);
  });

  it('extrait une preuve de naissance et compose un titre lisible', () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{
        localId: 'p1', firstNames: 'Jean', lastName: 'Durand',
        birth: { date: '1900-01-01', datePrecision: 'exact', proof: { type: 'family' } },
      }],
    });
    expect(model.proofs).toEqual([
      expect.objectContaining({
        subjectKind: 'individual', subjectLocalId: 'p1', eventType: 'birth',
        title: 'Information familiale — naissance — Jean Durand',
        proof: { type: 'family' },
      }),
    ]);
  });

  it("ignore la preuve de décès si isDeceased n'est pas vrai", () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{
        localId: 'p1',
        death: { date: '1950-01-01', datePrecision: 'exact', proof: { type: 'family' } },
      }],
    });
    expect(model.proofs).toEqual([]);
    expect(model.individuals[0].deathDate).toBeNull();
  });

  it('extrait la preuve de décès si isDeceased est vrai', () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{
        localId: 'p1', isDeceased: true,
        death: { date: '1950-01-01', datePrecision: 'exact', proof: { type: 'acte', url: 'https://x' } },
      }],
    });
    expect(model.proofs).toHaveLength(1);
    expect(model.proofs[0].eventType).toBe('death');
  });

  it('construit les filiations à partir de "parents"', () => {
    const model = mapCustomImportToStagingModel({
      individuals: [
        { localId: 'enfant', parents: ['pere', 'mere'] },
        { localId: 'pere' },
        { localId: 'mere' },
      ],
    });
    expect(model.filiations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ childLocalId: 'enfant', parentLocalId: 'pere' }),
        expect.objectContaining({ childLocalId: 'enfant', parentLocalId: 'mere' }),
      ])
    );
  });

  it('transmet le filiationType par défaut "biological" pour un parent texte, et celui fourni pour un parent objet', () => {
    const model = mapCustomImportToStagingModel({
      individuals: [
        {
          localId: 'enfant',
          parents: ['mere-bio', { id: 'pere-adoptif', filiationType: 'adoption_simple' }],
        },
        { localId: 'mere-bio' },
        { localId: 'pere-adoptif' },
      ],
    });
    expect(model.filiations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ childLocalId: 'enfant', parentLocalId: 'mere-bio', filiationType: 'biological' }),
        expect.objectContaining({ childLocalId: 'enfant', parentLocalId: 'pere-adoptif', filiationType: 'adoption_simple' }),
      ])
    );
  });

  it("relie la filiation à l'union correspondante quand les 2 parents sont aussi des partenaires", () => {
    const model = mapCustomImportToStagingModel({
      individuals: [
        { localId: 'enfant', parents: ['pere', 'mere'] },
        { localId: 'pere' },
        { localId: 'mere' },
      ],
      unions: [{ localId: 'u1', partners: ['pere', 'mere'] }],
    });
    for (const f of model.filiations) {
      expect(f.unionLocalId).toBe('u1');
    }
  });

  it('mappe une union avec ses partnerLocalIds (pas husband/wife)', () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{ localId: 'a' }, { localId: 'b' }],
      unions: [{ localId: 'u1', partners: ['a', 'b'], status: 'divorced', startDate: '1920-01-01', startDatePrecision: 'exact' }],
    });
    expect(model.families).toEqual([
      expect.objectContaining({ localId: 'u1', partnerLocalIds: ['a', 'b'], status: 'divorced' }),
    ]);
  });

  it("extrait la preuve de mariage avec subjectKind 'union' quand unionType: 'marriage' est explicite", () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{ localId: 'a' }, { localId: 'b' }],
      unions: [{ localId: 'u1', partners: ['a', 'b'], unionType: 'marriage', proof: { type: 'acte', url: 'https://archives/mariage' } }],
    });
    expect(model.families).toEqual([expect.objectContaining({ localId: 'u1', unionType: 'marriage' })]);
    expect(model.proofs).toEqual([
      expect.objectContaining({ subjectKind: 'union', subjectLocalId: 'u1', eventType: 'marriage' }),
    ]);
  });

  it("une union sans unionType ni status 'divorced'/'widowed' n'est jamais présumée mariage (reste 'unknown', preuve en 'union_start')", () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{ localId: 'a' }, { localId: 'b' }],
      unions: [{ localId: 'u1', partners: ['a', 'b'], proof: { type: 'family', transcription: 'En couple depuis 2020' } }],
    });
    expect(model.families).toEqual([expect.objectContaining({ localId: 'u1', unionType: 'unknown' })]);
    expect(model.proofs).toEqual([
      expect.objectContaining({ subjectKind: 'union', subjectLocalId: 'u1', eventType: 'union_start' }),
    ]);
  });

  it("une union 'divorced' est déduite comme mariage même sans unionType explicite", () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{ localId: 'a' }, { localId: 'b' }],
      unions: [{ localId: 'u1', partners: ['a', 'b'], status: 'divorced' }],
    });
    expect(model.families).toEqual([expect.objectContaining({ localId: 'u1', unionType: 'marriage', status: 'divorced' })]);
  });

  it("unionType: 'cohabitation' explicite est respecté", () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{ localId: 'a' }, { localId: 'b' }],
      unions: [{ localId: 'u1', partners: ['a', 'b'], unionType: 'cohabitation' }],
    });
    expect(model.families).toEqual([expect.objectContaining({ localId: 'u1', unionType: 'cohabitation' })]);
  });

  it("mappe endDate/endDatePrecision d'une union divorcée", () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{ localId: 'a' }, { localId: 'b' }],
      unions: [{
        localId: 'u1', partners: ['a', 'b'], status: 'divorced',
        startDate: '1924-04-26', startDatePrecision: 'exact',
        endDate: '1948-06-07', endDatePrecision: 'exact',
      }],
    });
    expect(model.families).toEqual([
      expect.objectContaining({ localId: 'u1', endDate: '1948-06-07', endDatePrecision: 'exact' }),
    ]);
  });

  it('déduit endDatePrecision à "exact" quand seul endDate est fourni', () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{ localId: 'a' }, { localId: 'b' }],
      unions: [{ localId: 'u1', partners: ['a', 'b'], status: 'divorced', endDate: '1948-06-07' }],
    });
    expect(model.families[0].endDatePrecision).toBe('exact');
  });

  it("extrait divorceProof comme une preuve distincte avec eventType 'divorce'", () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{ localId: 'a' }, { localId: 'b' }],
      unions: [{
        localId: 'u1', partners: ['a', 'b'], status: 'divorced',
        endDate: '1948-06-07', endDatePrecision: 'exact',
        divorceProof: { type: 'family', transcription: 'Jugement du 07/06/1948.' },
      }],
    });
    expect(model.proofs).toEqual([
      expect.objectContaining({
        subjectKind: 'union', subjectLocalId: 'u1', eventType: 'divorce',
        title: 'Jugement de divorce',
        snapshot: expect.objectContaining({ date: '1948-06-07', datePrecision: 'exact' }),
        proof: { type: 'family', transcription: 'Jugement du 07/06/1948.' },
      }),
    ]);
  });

  it("n'extrait pas divorceProof si endDate est absent", () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{ localId: 'a' }, { localId: 'b' }],
      unions: [{ localId: 'u1', partners: ['a', 'b'], divorceProof: { type: 'family' } }],
    });
    expect(model.proofs).toEqual([]);
  });

  it("avec un jalon 'marriage' dédié, startDate reste la mise en couple (preuve en 'union_start') et marriage devient son propre événement", () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{ localId: 'a' }, { localId: 'b' }],
      unions: [{
        localId: 'u1', partners: ['a', 'b'], unionType: 'marriage',
        startDate: '1920-01-01', startDatePrecision: 'exact',
        proof: { type: 'family', transcription: 'Vivent ensemble depuis 1920.' },
        marriage: {
          date: '1958-07-19', datePrecision: 'exact',
          place: { city: 'Paris', country: 'France' },
          proof: { type: 'acte', url: 'https://archives/mariage' },
        },
      }],
    });
    expect(model.families).toEqual([
      expect.objectContaining({
        localId: 'u1', startDate: '1920-01-01', marriageDate: '1958-07-19', marriageDatePrecision: 'exact',
      }),
    ]);
    expect(model.families[0].marriagePlaceLocalId).toBeTruthy();
    expect(model.proofs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subjectKind: 'union', subjectLocalId: 'u1', eventType: 'union_start', proof: { type: 'family', transcription: 'Vivent ensemble depuis 1920.' } }),
        expect.objectContaining({ subjectKind: 'union', subjectLocalId: 'u1', eventType: 'marriage', proof: { type: 'acte', url: 'https://archives/mariage' } }),
      ])
    );
  });

  it("sans jalon 'marriage' explicite, le comportement historique est inchangé (startDate = date de mariage pour unionType: 'marriage')", () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{ localId: 'a' }, { localId: 'b' }],
      unions: [{ localId: 'u1', partners: ['a', 'b'], unionType: 'marriage', startDate: '1958-07-19', startDatePrecision: 'exact' }],
    });
    expect(model.families[0].splitMarriageMilestone).toBe(false);
    expect(model.families[0].marriageDate).toBeNull();
  });

  it('transmet divorcePlace comme lieu structuré rattaché à la preuve de divorce', () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{ localId: 'a' }, { localId: 'b' }],
      unions: [{
        localId: 'u1', partners: ['a', 'b'], status: 'divorced',
        endDate: '1948-06-07', endDatePrecision: 'exact',
        divorcePlace: { city: 'Paris', country: 'France' },
        divorceProof: { type: 'family' },
      }],
    });
    expect(model.families[0].divorcePlaceLocalId).toBeTruthy();
    expect(model.proofs).toEqual([
      expect.objectContaining({ eventType: 'divorce', snapshot: expect.objectContaining({ placeLocalId: model.families[0].divorcePlaceLocalId }) }),
    ]);
  });
});

describe('mapCustomImportToStagingModel — titres des sources d\'union', () => {
  it('ajoute le nom des deux conjoints au titre de la preuve', () => {
    const model = mapCustomImportToStagingModel({
      individuals: [{ localId: 'a', firstNames: 'Charles', lastName: 'Ternay' }, { localId: 'b', firstNames: 'Marguerite', lastName: 'Couteau' }],
      unions: [{ localId: 'u1', partners: ['a', 'b'], status: 'divorced', endDate: '1948-06-07', divorceProof: { type: 'family' } }],
    });
    expect(model.proofs[0].title).toBe('Jugement de divorce — Charles Ternay & Marguerite Couteau');
  });
});
