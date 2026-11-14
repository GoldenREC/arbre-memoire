import { describe, it, expect } from 'vitest';
import { buildCustomImportModel } from './customFormatExporter.js';

function makeSnapshot() {
  const places = [
    { id: 'place-birth', raw_label: 'Paris', city: 'Paris', country: 'France' },
    { id: 'place-marriage', raw_label: 'Paris', city: 'Paris', country: 'France' },
    { id: 'place-divorce', raw_label: 'Lyon', city: 'Lyon', country: 'France' },
  ];
  const placesById = new Map(places.map((p) => [p.id, p]));

  const individuals = [
    {
      id: 'ind-charles', firstNames: 'Charles', lastName: 'Ternay', birthName: null, nickname: null, sex: 'M',
      birthDate: '1905-02-23', birthDatePrecision: 'exact', birthPlaceId: 'place-birth',
      deathDate: '1979-02-25', deathDatePrecision: 'exact', deathPlaceId: null,
      isDeceased: true, occupation: 'Cultivateur', biography: null,
    },
    {
      id: 'ind-marguerite', firstNames: 'Marguerite', lastName: 'Couteau', birthName: null, nickname: null, sex: 'F',
      birthDate: null, birthDatePrecision: 'unknown', birthPlaceId: null,
      deathDate: null, deathDatePrecision: 'unknown', deathPlaceId: null,
      isDeceased: false, occupation: null, biography: null,
    },
    {
      id: 'ind-enfant', firstNames: 'Jean', lastName: 'Ternay', birthName: null, nickname: null, sex: 'M',
      birthDate: null, birthDatePrecision: 'unknown', birthPlaceId: null,
      deathDate: null, deathDatePrecision: 'unknown', deathPlaceId: null,
      isDeceased: false, occupation: null, biography: null,
    },
  ];

  const unions = [
    {
      id: 'union-1', unionType: 'marriage', status: 'divorced',
      startDate: '1920-01-01', startDatePrecision: 'exact', placeId: 'place-birth',
      endDate: '1948-06-07', endDatePrecision: 'exact',
      partners: [{ individualId: 'ind-charles' }, { individualId: 'ind-marguerite' }],
    },
  ];

  const filiations = [
    { id: 'f1', childId: 'ind-enfant', parentId: 'ind-charles', filiationType: 'biological' },
    { id: 'f2', childId: 'ind-enfant', parentId: 'ind-marguerite', filiationType: 'adoption_simple' },
  ];

  const events = [
    { id: 'ev-birth', subjectKind: 'individual', subjectId: 'ind-charles', eventType: 'birth', eventDate: '1905-02-23', datePrecision: 'exact', placeId: 'place-birth' },
    { id: 'ev-death', subjectKind: 'individual', subjectId: 'ind-charles', eventType: 'death', eventDate: '1979-02-25', datePrecision: 'exact', placeId: null },
    { id: 'ev-start', subjectKind: 'union', subjectId: 'union-1', eventType: 'union_start', eventDate: '1920-01-01', datePrecision: 'exact', placeId: 'place-birth' },
    { id: 'ev-marriage', subjectKind: 'union', subjectId: 'union-1', eventType: 'marriage', eventDate: '1930-05-05', datePrecision: 'exact', placeId: 'place-marriage' },
    { id: 'ev-divorce', subjectKind: 'union', subjectId: 'union-1', eventType: 'divorce', eventDate: '1948-06-07', datePrecision: 'exact', placeId: 'place-divorce' },
  ];

  const sources = [
    { id: 'src-birth', title: 'Acte de naissance', sourceType: 'civil_record', repository: 'Archives de Paris', callNumber: 'acte n°392', url: null },
    { id: 'src-death', title: 'Acte de décès', sourceType: 'family_data', repository: null, callNumber: null, url: null },
    { id: 'src-marriage', title: 'Acte de mariage', sourceType: 'civil_record', repository: null, callNumber: null, url: 'https://archives/mariage' },
  ];

  const citations = [
    { id: 'cit-birth', sourceId: 'src-birth', eventId: 'ev-birth', transcription: 'Déclaré par le père.' },
    { id: 'cit-death', sourceId: 'src-death', eventId: 'ev-death', transcription: null },
    { id: 'cit-marriage', sourceId: 'src-marriage', eventId: 'ev-marriage', transcription: null },
  ];

  const media = [
    { id: 'media-birth', mediaType: 'document', storagePath: 'tree-1/actes/media-birth-acte.jpg', title: 'acte.jpg', sourceId: 'src-birth' },
  ];

  return {
    treeId: 'tree-1',
    individuals,
    unions,
    filiations,
    places,
    placesById,
    events,
    sources,
    citations,
    media,
  };
}

describe('buildCustomImportModel', () => {
  it('exporte formatVersion et le même nombre de individuals/unions', () => {
    const { arbreJson } = buildCustomImportModel(makeSnapshot());
    expect(arbreJson.formatVersion).toBe('1.0');
    expect(arbreJson.individuals).toHaveLength(3);
    expect(arbreJson.unions).toHaveLength(1);
  });

  it("reconstruit l'objet birth avec lieu structuré et preuve (acte + scan)", () => {
    const { arbreJson, imageRefs } = buildCustomImportModel(makeSnapshot());
    const charles = arbreJson.individuals.find((i) => i.localId === 'ind-charles');
    expect(charles.birth).toEqual({
      date: '1905-02-23', datePrecision: 'exact',
      place: { city: 'Paris', country: 'France' },
      proof: {
        type: 'acte', repository: 'Archives de Paris', reference: 'acte n°392',
        transcription: 'Déclaré par le père.', imageFile: 'images/media-birth-acte.jpg',
      },
    });
    expect(imageRefs).toEqual([{ path: 'images/media-birth-acte.jpg', storagePath: 'tree-1/actes/media-birth-acte.jpg', mediaId: 'media-birth' }]);
  });

  it('reconstruit death avec une preuve "family" (information familiale)', () => {
    const { arbreJson } = buildCustomImportModel(makeSnapshot());
    const charles = arbreJson.individuals.find((i) => i.localId === 'ind-charles');
    expect(charles.isDeceased).toBe(true);
    expect(charles.death).toEqual({
      date: '1979-02-25', datePrecision: 'exact', place: null,
      proof: { type: 'family' },
    });
  });

  it('omet death pour une personne vivante', () => {
    const { arbreJson } = buildCustomImportModel(makeSnapshot());
    const marguerite = arbreJson.individuals.find((i) => i.localId === 'ind-marguerite');
    expect(marguerite.isDeceased).toBe(false);
    expect(marguerite.death).toBeUndefined();
  });

  it('retranscrit les parents avec filiationType non biologique sous forme d\'objet', () => {
    const { arbreJson } = buildCustomImportModel(makeSnapshot());
    const enfant = arbreJson.individuals.find((i) => i.localId === 'ind-enfant');
    expect(enfant.parents).toEqual(
      expect.arrayContaining(['ind-charles', { id: 'ind-marguerite', filiationType: 'adoption_simple' }])
    );
  });

  it('sépare mise en couple (startDate/proof) et mariage (sous-objet marriage) comme deux jalons distincts', () => {
    const { arbreJson } = buildCustomImportModel(makeSnapshot());
    const union = arbreJson.unions[0];
    expect(union.startDate).toBe('1920-01-01');
    expect(union.place).toEqual({ city: 'Paris', country: 'France' });
    expect(union.proof).toBeNull(); // pas de citation sur l'événement union_start dans ce fixture
    expect(union.marriage).toEqual({
      date: '1930-05-05', datePrecision: 'exact',
      place: { city: 'Paris', country: 'France' },
      proof: { type: 'acte', url: 'https://archives/mariage' },
    });
  });

  it('exporte endDate/divorcePlace/divorceProof à partir de l\'événement "divorce" dédié', () => {
    const { arbreJson } = buildCustomImportModel(makeSnapshot());
    const union = arbreJson.unions[0];
    expect(union.endDate).toBe('1948-06-07');
    expect(union.endDatePrecision).toBe('exact');
    expect(union.divorcePlace).toEqual({ city: 'Lyon', country: 'France' });
    // Pas de citation sur ev-divorce dans ce fixture -> pas de divorceProof.
    expect(union.divorceProof).toBeUndefined();
  });

  it('exporte les partenaires de l\'union par individualId', () => {
    const { arbreJson } = buildCustomImportModel(makeSnapshot());
    expect(arbreJson.unions[0].partners).toEqual(['ind-charles', 'ind-marguerite']);
  });

  it('rétrograde une preuve "acte" sans url ni média en "family" plutôt que de produire un fichier invalide', () => {
    const snapshot = makeSnapshot();
    snapshot.sources.push({ id: 'src-orphan', title: 'Acte perdu', sourceType: 'civil_record', repository: null, callNumber: null, url: null });
    snapshot.citations.push({ id: 'cit-orphan', sourceId: 'src-orphan', eventId: 'ev-death', transcription: null });
    // ev-death cite déjà src-death ; on simule ici un deuxième cas isolé en
    // pointant un nouvel événement fictif pour tester uniquement la règle
    // de rétrogradation (pas le choix de la citation).
    snapshot.events.push({ id: 'ev-orphan', subjectKind: 'individual', subjectId: 'ind-marguerite', eventType: 'birth', eventDate: '1910-01-01', datePrecision: 'exact', placeId: null });
    snapshot.citations[snapshot.citations.length - 1].eventId = 'ev-orphan';
    const { arbreJson } = buildCustomImportModel(snapshot);
    const marguerite = arbreJson.individuals.find((i) => i.localId === 'ind-marguerite');
    expect(marguerite.birth.proof.type).toBe('family');
  });
});
