import { describe, expect, it } from 'vitest';
import { buildFamilyLayout, computeLevels, CARD_W } from './buildFamilyLayout.js';

// Fixture au format de loadFamilyGraph.
function fakeGraph({ people, unions = [], links = [] }) {
  const parentsOf = (id) => links.filter((l) => l.childId === id).map((l) => ({ parentId: l.parentId, unionId: l.unionId ?? null, filiationType: l.filiationType || 'biological' }));
  const childrenOf = (id) => links.filter((l) => l.parentId === id).map((l) => l.childId);
  const unionsOf = (id) => unions.filter((u) => u.partnerIds.includes(id));
  return {
    unions: new Map(unions.map((u) => [u.id, u])),
    getIndividual: (id) => (people[id] ? { id, birthDate: people[id].birth || null } : null),
    getParents: parentsOf,
    getChildren: childrenOf,
    getUnions: unionsOf,
    getSpouses: (id) => unionsOf(id).flatMap((u) => u.partnerIds).filter((p) => p !== id),
  };
}

// Famille : grands-parents G1+G2 -> Père (+ sa sœur Tante) ; Père + Mère -> Moi, frère Toi2 ; Moi + Épouse -> Enfant.
const people = { g1: {}, g2: {}, pere: { birth: '1950' }, tante: { birth: '1952' }, mere: {}, moi: { birth: '1980' }, toi2: { birth: '1985' }, epouse: {}, enfant: {} };
const unions = [
  { id: 'uG', partnerIds: ['g1', 'g2'] },
  { id: 'uP', partnerIds: ['pere', 'mere'] },
  { id: 'uM', partnerIds: ['moi', 'epouse'] },
];
const links = [
  { parentId: 'g1', childId: 'pere', unionId: 'uG' },
  { parentId: 'g2', childId: 'pere', unionId: 'uG' },
  { parentId: 'g1', childId: 'tante', unionId: 'uG' },
  { parentId: 'g2', childId: 'tante', unionId: 'uG' },
  { parentId: 'pere', childId: 'moi', unionId: 'uP' },
  { parentId: 'mere', childId: 'moi', unionId: 'uP' },
  { parentId: 'pere', childId: 'toi2', unionId: 'uP' },
  { parentId: 'mere', childId: 'toi2', unionId: 'uP' },
  { parentId: 'moi', childId: 'enfant', unionId: 'uM' },
  { parentId: 'epouse', childId: 'enfant', unionId: 'uM' },
];
const graph = fakeGraph({ people, unions, links });

describe('computeLevels', () => {
  it('place les ancêtres au-dessus, les descendants en dessous, les conjoints au même niveau', () => {
    const lv = computeLevels(graph, 'moi');
    expect(lv.get('pere')).toBe(1);
    expect(lv.get('mere')).toBe(1);
    expect(lv.get('g1')).toBe(2);
    expect(lv.get('toi2')).toBe(0);
    expect(lv.get('epouse')).toBe(0);
    expect(lv.get('enfant')).toBe(-1);
  });
});

describe('buildFamilyLayout', () => {
  const layout = buildFamilyLayout(graph, 'moi');

  it('renvoie null pour une racine inconnue', () => {
    expect(buildFamilyLayout(graph, 'inconnu')).toBeNull();
  });

  it('place chaque personne une seule fois', () => {
    const ids = layout.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(['enfant', 'epouse', 'g1', 'g2', 'mere', 'moi', 'pere', 'tante', 'toi2'].sort());
  });

  it('range les générations de haut en bas : ancêtres, racine, descendants', () => {
    const y = (id) => layout.nodes.find((n) => n.id === id).y;
    expect(y('g1')).toBeLessThan(y('pere'));
    expect(y('pere')).toBeLessThan(y('moi'));
    expect(y('moi')).toBeLessThan(y('enfant'));
  });

  it('met les frères et sœurs sur la même ligne', () => {
    const y = (id) => layout.nodes.find((n) => n.id === id).y;
    expect(y('moi')).toBe(y('toi2'));
  });

  it('ne fait jamais se chevaucher deux cartes sur la même ligne', () => {
    const rows = new Map();
    for (const n of layout.nodes) {
      if (!rows.has(n.y)) rows.set(n.y, []);
      rows.get(n.y).push(n.x);
    }
    for (const xs of rows.values()) {
      const sorted = [...xs].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(208);
    }
  });

  it('centre le parent au-dessus de l\'espace de ses enfants', () => {
    const x = (id) => layout.nodes.find((n) => n.id === id).x;
    const kidsX = [x('moi'), x('toi2')];
    const center = (Math.min(...kidsX) + Math.max(...kidsX)) / 2;
    expect(x('pere')).toBeGreaterThanOrEqual(Math.min(...kidsX) - 1);
    expect(x('pere')).toBeLessThanOrEqual(Math.max(...kidsX) + 1);
    expect(Math.abs(x('pere') - center)).toBeLessThan(400);
  });

  it('relie chaque enfant à chacun de ses vrais parents, et à aucun autre', () => {
    const parentsOfChild = (id) => layout.links.filter((l) => l.childId === id).map((l) => l.parentId).sort();
    expect(parentsOfChild('moi')).toEqual(['mere', 'pere']);
    expect(parentsOfChild('tante')).toEqual(['g1', 'g2']);
    expect(parentsOfChild('enfant')).toEqual(['epouse', 'moi']);
  });

  it('ne renvoie une union que si elle existe entre deux personnes voisines', () => {
    const pairs = layout.couples.map((c) => c.unionId).sort();
    expect(pairs).toEqual(['uG', 'uM', 'uP']);
  });
});

describe('frères et sœurs', () => {
  it('sans l\'option, les frères et sœurs de la racine et des ancêtres restent cachés', () => {
    const lv = computeLevels(graph, 'moi', { showSiblings: false });
    expect(lv.has('toi2')).toBe(false); // sœur de moi
    expect(lv.has('tante')).toBe(false); // sœur du père
    expect(lv.has('pere')).toBe(true); // ancêtre gardé
    expect(lv.has('enfant')).toBe(true); // descendant gardé
  });
  it('avec l\'option, ils apparaissent', () => {
    const lv = computeLevels(graph, 'moi', { showSiblings: true });
    expect(lv.has('toi2')).toBe(true);
    expect(lv.has('tante')).toBe(true);
  });
});

describe('ordre des conjoints autour de la racine', () => {
  // Racine « moi » (conjointe à droite), sœur aînée « soeur » avec son conjoint « mari », frère cadet « toi2 ».
  const people2 = { pere: {birth:'1950'}, mere: {}, soeur: {birth:'1978'}, mari: {}, moi: {birth:'1980'}, epouse: {}, toi2: {birth:'1985'} };
  const unions2 = [
    { id: 'uP', partnerIds: ['pere', 'mere'] },
    { id: 'uS', partnerIds: ['soeur', 'mari'] },
    { id: 'uM', partnerIds: ['moi', 'epouse'] },
  ];
  const links2 = [['pere','soeur'],['mere','soeur'],['pere','moi'],['mere','moi'],['pere','toi2'],['mere','toi2']]
    .map(([parentId, childId]) => ({ parentId, childId, unionId: null, filiationType: 'biological' }));
  const g2 = fakeGraph({ people: people2, unions: unions2, links: links2 });
  const lay = buildFamilyLayout(g2, 'moi');
  const x = (id) => lay.nodes.find((n) => n.id === id).x;

  it('la sœur aînée a son conjoint à sa gauche', () => {
    expect(x('mari')).toBeLessThan(x('soeur'));
  });
  it('la racine a son conjoint à sa droite, la sœur à sa gauche', () => {
    expect(x('soeur')).toBeLessThan(x('moi'));
    expect(x('moi')).toBeLessThan(x('epouse'));
  });
  it('le frère cadet reste à droite de la racine', () => {
    expect(x('moi')).toBeLessThan(x('toi2'));
  });
});

describe('aucune union enregistrée n\'est oubliée', () => {
  it('chaque union dont les deux conjoints sont dans l\'arbre est tracée (en couple ou en arc)', () => {
    // « ex » est une personne sans parent connu : placée à part, donc non voisine de « mere ».
    const people3 = { pere: {birth:'1950'}, mere: {}, moi: {birth:'1980'}, ex: {birth:'1960'} };
    const unions3 = [
      { id: 'uP', partnerIds: ['pere', 'mere'] },
      { id: 'uX', partnerIds: ['mere', 'ex'], unionType: 'marriage', status: 'divorced' },
    ];
    const links3 = [['pere','moi'],['mere','moi']].map(([parentId, childId]) => ({ parentId, childId, unionId: null, filiationType: 'biological' }));
    const g3 = fakeGraph({ people: people3, unions: unions3, links: links3 });
    const lay3 = buildFamilyLayout(g3, 'moi');
    const drawn = [...lay3.couples.map((c) => c.unionId), ...lay3.arcs.map((a) => a.unionId)];
    expect(drawn).toEqual(expect.arrayContaining(['uP', 'uX']));
  });
});

describe('conjoints voisins de la personne', () => {
  // « moi » a un conjoint actuel (b) et un ancien (a) : chacun est à côté de moi, d'un côté ou de l'autre.
  const people4 = { moi: { birth: '1980' }, a: {}, b: {} };
  const unions4 = [
    { id: 'uA', partnerIds: ['moi', 'a'], status: 'divorced', unionType: 'marriage' },
    { id: 'uB', partnerIds: ['moi', 'b'], status: 'ongoing', unionType: 'marriage' },
  ];
  const g4 = fakeGraph({ people: people4, unions: unions4, links: [] });
  const lay4 = buildFamilyLayout(g4, 'moi');
  const x4 = (id) => lay4.nodes.find((n) => n.id === id).x;

  it('le conjoint actuel est à côté de la personne', () => {
    expect(Math.abs(x4('b') - x4('moi'))).toBe(228);
  });
  it('l\'ancien conjoint est aussi à côté, de l\'autre côté', () => {
    expect(Math.abs(x4('a') - x4('moi'))).toBe(228);
    expect(Math.sign(x4('a') - x4('moi'))).toBe(-Math.sign(x4('b') - x4('moi')));
  });
});

describe('chaîne des conjoints à gauche', () => {
  // « moi » a un ancien conjoint à gauche (a), dont le conjoint suivant (a2) doit être plus loin que a.
  const people5 = { moi: { birth: '1980' }, a: {}, a2: {}, b: {} };
  const unions5 = [
    { id: 'uA', partnerIds: ['moi', 'a'], status: 'divorced', unionType: 'marriage' },
    { id: 'uA2', partnerIds: ['a', 'a2'], status: 'ongoing', unionType: 'marriage' },
    { id: 'uB', partnerIds: ['moi', 'b'], status: 'ongoing', unionType: 'marriage' },
  ];
  const g5 = fakeGraph({ people: people5, unions: unions5, links: [] });
  const lay5 = buildFamilyLayout(g5, 'moi');
  const x5 = (id) => lay5.nodes.find((n) => n.id === id).x;

  it('l\'ancien conjoint est au plus près, son conjoint suivant est derrière lui', () => {
    expect(x5('a') - x5('a2')).toBe(228);
    expect(x5('a')).toBeLessThan(x5('moi'));
    expect(x5('moi') - x5('a')).toBe(228);
  });
});

describe('famille du conjoint non affichée', () => {
  it('les parents de la conjointe ne sont pas ajoutés à l\'arbre', () => {
    const people6 = { moi: {}, ep: {}, gp1: {}, gp2: {} };
    const unions6 = [{ id: 'uE', partnerIds: ['moi', 'ep'], status: 'ongoing', unionType: 'marriage' }];
    const links6 = [{ parentId: 'gp1', childId: 'ep' }, { parentId: 'gp2', childId: 'ep' }];
    const g6 = fakeGraph({ people: people6, unions: unions6, links: links6 });
    const lv = computeLevels(g6, 'moi', { showSiblings: true });
    expect(lv.has('ep')).toBe(true);
    expect(lv.has('gp1')).toBe(false);
    expect(lv.has('gp2')).toBe(false);
  });
});

describe('anciens conjoints : le plus récent est le plus proche', () => {
  // Conjoint actuel à droite ; deux anciens à gauche : le plus récent (x) doit être le plus proche de la personne.
  const people7 = { moi: {}, cur: {}, old: {}, older: {} };
  const unions7 = [
    { id: 'uCur', partnerIds: ['moi', 'cur'], status: 'ongoing', unionType: 'marriage', startDate: '2010-01-01' },
    { id: 'uOld', partnerIds: ['moi', 'old'], status: 'divorced', unionType: 'marriage', startDate: '2002-01-01' },
    { id: 'uOlder', partnerIds: ['moi', 'older'], status: 'divorced', unionType: 'marriage', startDate: '1995-01-01' },
  ];
  const g7 = fakeGraph({ people: people7, unions: unions7, links: [] });
  const lay7 = buildFamilyLayout(g7, 'moi');
  const x7 = (id) => lay7.nodes.find((n) => n.id === id).x;

  it('le conjoint actuel est à droite, au plus près', () => {
    expect(x7('cur')).toBeGreaterThan(x7('moi'));
    expect(x7('cur') - x7('moi')).toBe(228);
  });
  it('l\'ancien conjoint le plus récent est à gauche, au plus près ; le plus ancien plus loin', () => {
    expect(x7('moi') - x7('old')).toBe(228);
    expect(x7('old')).toBeGreaterThan(x7('older'));
  });
});

describe('union non voisine : tracée depuis les bords des cartes', () => {
  it('l\'arc part du bord de la carte et arrive au bord de l\'autre conjoint', () => {
    // moi – a (voisin) – c : l'union moi–c ne peut pas être voisine, elle doit être tracée en arc.
    const people8 = { moi: {}, a: {}, c: {} };
    const unions8 = [
      { id: 'uA', partnerIds: ['moi', 'a'], status: 'divorced', unionType: 'marriage', startDate: '2000-01-01' },
      { id: 'uC', partnerIds: ['a', 'c'], status: 'ongoing', unionType: 'marriage', startDate: '2005-01-01' },
      { id: 'uX', partnerIds: ['moi', 'c'], status: 'separated', unionType: 'cohabitation', startDate: null },
    ];
    const g8 = fakeGraph({ people: people8, unions: unions8, links: [] });
    const lay8 = buildFamilyLayout(g8, 'moi');
    const x8 = (id) => lay8.nodes.find((n) => n.id === id).x;
    const arc = lay8.arcs.find((r) => r.unionId === 'uX');
    expect(arc).toBeDefined();
    const [near, far] = x8('moi') > x8('c') ? [x8('moi'), x8('c')] : [x8('c'), x8('moi')];
    expect(Math.min(arc.ax, arc.bx)).toBe(far < near ? far + CARD_W / 2 : near - CARD_W / 2);
    expect(Math.max(arc.ax, arc.bx)).toBe(far < near ? near - CARD_W / 2 : far + CARD_W / 2);
  });
});
