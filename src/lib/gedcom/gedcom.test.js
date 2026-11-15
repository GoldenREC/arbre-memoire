import { describe, it, expect } from 'vitest';
import { parseGedcom, parseGedcomDate } from './parser.js';
import { mapGedcomToStagingModel } from './mapper.js';

const SAMPLE_GEDCOM = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Jean Pierre /Dupont/
1 SEX M
1 BIRT
2 DATE 12 JAN 1900
2 PLAC Grasse, Alpes-Maritimes, France
1 FAMS @F1@
0 @I2@ INDI
1 NAME Marie /Martin/
1 SEX F
1 BIRT
2 DATE ABT 1902
1 FAMS @F1@
0 @I3@ INDI
1 NAME Paul /Dupont/
1 SEX M
1 BIRT
2 DATE 1925
1 FAMC @F1@
2 PEDI birth
1 DEAT
2 DATE 2001
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1922
2 PLAC Nice, France
0 TRLR
`;

describe('parseGedcom', () => {
  it('extrait la version et les enregistrements de niveau 0', () => {
    const { version, records } = parseGedcom(SAMPLE_GEDCOM);
    expect(version).toBe('5.5.1');
    expect(records.filter((r) => r.tag === 'INDI')).toHaveLength(3);
    expect(records.filter((r) => r.tag === 'FAM')).toHaveLength(1);
  });
});

describe('parseGedcomDate', () => {
  it('gère une date exacte', () => {
    expect(parseGedcomDate('12 JAN 1900')).toMatchObject({ date: '1900-01-12', datePrecision: 'exact' });
  });
  it('gère ABT (approximatif)', () => {
    expect(parseGedcomDate('ABT 1902')).toMatchObject({ date: '1902-01-01', datePrecision: 'about' });
  });
  it('gère une année seule', () => {
    expect(parseGedcomDate('1925')).toMatchObject({ date: '1925-01-01', datePrecision: 'about' });
  });
});

describe('mapGedcomToStagingModel', () => {
  it('construit individus, familles et filiations', () => {
    const parsed = parseGedcom(SAMPLE_GEDCOM);
    const model = mapGedcomToStagingModel(parsed);

    expect(model.individuals).toHaveLength(3);
    expect(model.families).toHaveLength(1);

    const paul = model.individuals.find((i) => i.gedcomXref === 'I3');
    expect(paul.firstNames).toBe('Paul');
    expect(paul.lastName).toBe('Dupont');
    expect(paul.isDeceased).toBe(true);

    expect(model.filiations).toHaveLength(2); // Paul -> père et mère
    const toJean = model.filiations.find((f) => f.parentLocalId === 'gedcom:I1');
    expect(toJean.filiationType).toBe('biological');

    // Un lieu de naissance + un lieu de mariage = 2 lieux uniques
    expect(model.places.length).toBeGreaterThanOrEqual(2);
  });
});
