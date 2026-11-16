import { describe, expect, it } from 'vitest';
import { buildCoupleRow } from './buildCoupleRow.js';

// Petit graphe factice au format de loadFamilyGraph.
function fakeGraph({ people, unions, links }) {
  const unionsOf = (id) => unions.filter((u) => u.partnerIds.includes(id));
  return {
    getIndividual: (id) => (people.includes(id) ? { id } : null),
    getUnions: (id) => unionsOf(id),
    getChildren: (id) => links.filter((l) => l.parentId === id).map((l) => l.childId),
    getParents: (id) => links.filter((l) => l.childId === id).map((l) => ({ parentId: l.parentId, unionId: l.unionId, filiationType: l.filiationType })),
  };
}

// Cas de Gilles : Eva (divorcée) – Gilles – Laetitia – Christophe – Maritza.
const people = ['gilles', 'eva', 'laetitia', 'christophe', 'maritza', 'toi'];
const unions = [
  { id: 'u-eva', partnerIds: ['gilles', 'eva'], status: 'divorced', startDate: '1995-01-01' },
  { id: 'u-lae', partnerIds: ['gilles', 'laetitia'], status: 'ongoing', startDate: '2005-01-01' },
  { id: 'u-chr', partnerIds: ['laetitia', 'christophe'], status: 'divorced', startDate: '1980-01-01' },
  { id: 'u-mar', partnerIds: ['christophe', 'maritza'], status: 'ongoing', startDate: '2012-01-01' },
];
const links = [{ parentId: 'gilles', childId: 'toi', unionId: 'u-lae', filiationType: 'adoption_simple' }];

describe('buildCoupleRow', () => {
  it('place la chaîne complète autour de Gilles', () => {
    const r = buildCoupleRow(fakeGraph({ people, unions, links }), 'gilles');
    expect(r.row.map((x) => x.personId)).toEqual(['eva', 'gilles', 'laetitia', 'christophe', 'maritza']);
  });

  it('range les unions de la racine par date (la plus ancienne à gauche)', () => {
    const r = buildCoupleRow(fakeGraph({ people, unions, links }), 'laetitia');
    expect(r.row.map((x) => x.personId)).toEqual(['maritza', 'christophe', 'laetitia', 'gilles', 'eva']);
  });

  it('garde le statut et la date de chaque couple pour le tracé', () => {
    const r = buildCoupleRow(fakeGraph({ people, unions, links }), 'laetitia');
    const chr = r.couples.find((c) => c.unionId === 'u-chr');
    expect(chr).toMatchObject({ status: 'divorced', innerId: 'laetitia', outerId: 'christophe' });
  });

  it('range les enfants sous leur union', () => {
    const r = buildCoupleRow(fakeGraph({ people, unions, links }), 'gilles');
    expect(r.groups).toEqual([
      { key: 'u:u-lae', unionId: 'u-lae', parentIds: ['gilles', 'laetitia'], children: [{ childId: 'toi', filiationType: 'adoption_simple' }] },
    ]);
  });

  it('renvoie null pour une racine inconnue', () => {
    expect(buildCoupleRow(fakeGraph({ people, unions, links }), 'inconnu')).toBeNull();
  });
});
