import { describe, it, expect, vi, beforeEach } from 'vitest';
import { partnersKey } from './commitImport.js';

/**
 * Mock minimal mais fidèle du client Supabase utilisé par commitImport.js.
 * Chaque table a une "mémoire" en mémoire (tableData) qui permet de simuler
 * un état de base existant (ex. une union déjà présente avant l'import) et
 * d'observer ce qui a réellement été envoyé en insert/update/upsert.
 */
function makeSupabaseMock(initial = {}) {
  const tables = {
    places: [], sources: [], individuals: [], unions: [], union_partners: [],
    filiations: [], events: [],
    ...initial,
  };
  const inserted = {}; // table -> rows passées à insert()
  const upserted = {}; // table -> rows passées à upsert()

  function builder(table) {
    const b = {
      _filters: [],
      select(cols) {
        this._select = cols;
        return this;
      },
      eq(col, val) {
        this._filters.push([col, val]);
        return this;
      },
      insert(rows) {
        const arr = Array.isArray(rows) ? rows : [rows];
        inserted[table] = (inserted[table] || []).concat(arr);
        this._insertedRows = arr.map((r, i) => ({ id: `${table}-new-${(tables[table].length + i)}`, ...r }));
        tables[table] = tables[table].concat(this._insertedRows);
        return this;
      },
      update(patch) {
        this._update = patch;
        return this;
      },
      upsert(rows) {
        const arr = Array.isArray(rows) ? rows : [rows];
        upserted[table] = (upserted[table] || []).concat(arr);
        return this;
      },
      then(resolve) {
        if (table === 'union_partners' && this._select) {
          // Jointure simulée union_partners -> unions!inner(tree_id)
          const treeFilter = this._filters.find(([c]) => c === 'unions.tree_id');
          const rows = tables.union_partners.filter(() => true); // tree_id déjà filtré par le test via `initial`
          resolve({ data: rows, error: null });
          return;
        }
        if (this._update) {
          const idFilter = this._filters.find(([c]) => c === 'id');
          const idx = tables[table].findIndex((r) => r.id === idFilter?.[1]);
          if (idx >= 0) tables[table][idx] = { ...tables[table][idx], ...this._update };
          resolve({ data: null, error: null });
          return;
        }
        if (this._insertedRows) {
          resolve({ data: this._insertedRows.map((r) => ({ id: r.id })), error: null });
          return;
        }
        resolve({ data: null, error: null });
      },
    };
    return b;
  }

  return {
    supabase: { from: (table) => builder(table) },
    tables, inserted, upserted,
  };
}

let mock;
vi.mock('../supabaseClient.js', () => ({
  get supabase() { return mock.supabase; },
}));

describe('partnersKey', () => {
  const individualIdMap = new Map([['gedcom:I1', 'real-christophe'], ['gedcom:I2', 'real-laetitia'], ['gedcom:I695', 'real-gilles']]);

  it('builds the same sorted key regardless of husband/wife order', () => {
    const a = partnersKey({ husbandLocalId: 'gedcom:I1', wifeLocalId: 'gedcom:I2' }, individualIdMap);
    const b = partnersKey({ husbandLocalId: 'gedcom:I2', wifeLocalId: 'gedcom:I1' }, individualIdMap);
    expect(a).toBe(b);
  });

  it('returns null when neither partner resolves to a real individual', () => {
    expect(partnersKey({ husbandLocalId: 'gedcom:I999' }, individualIdMap)).toBeNull();
  });

  it('distinguishes two different couples sharing one partner', () => {
    const christopheLaetitia = partnersKey({ husbandLocalId: 'gedcom:I1', wifeLocalId: 'gedcom:I2' }, individualIdMap);
    const gillesLaetitia = partnersKey({ husbandLocalId: 'gedcom:I695', wifeLocalId: 'gedcom:I2' }, individualIdMap);
    expect(christopheLaetitia).not.toBe(gillesLaetitia);
  });
});

describe('commitImport — déduplication des unions (régression duplication mariages)', () => {
  beforeEach(() => {
    mock = makeSupabaseMock();
  });

  it('ne crée qu\'une seule union quand 2 enregistrements FAM du même import partagent les 2 mêmes partenaires', async () => {
    const { commitImport } = await import('./commitImport.js');
    mock = makeSupabaseMock({
      individuals: [{ id: 'real-christophe' }, { id: 'real-laetitia' }],
    });

    const model = {
      treeId: 'tree-1',
      importBatchId: 'batch-1',
      places: [],
      sources: [],
      individuals: [
        { localId: 'gedcom:I1', existingId: 'real-christophe', firstNames: 'Christophe', lastName: 'Ternay' },
        { localId: 'gedcom:I2', existingId: 'real-laetitia', firstNames: 'Laetitia', lastName: 'Lalet' },
      ],
      families: [
        // F1 : fragment complet (le "vrai" mariage, avec divorce)
        { localId: 'gedcom:F1', husbandLocalId: 'gedcom:I1', wifeLocalId: 'gedcom:I2', childrenLocalIds: [], unionType: 'marriage', status: 'divorced' },
        // F694 : même couple (mêmes 2 partenaires), répété par une 2e source
        // fusionnée dans le même GEDCOM de corrélation.
        { localId: 'gedcom:F694', husbandLocalId: 'gedcom:I1', wifeLocalId: 'gedcom:I2', childrenLocalIds: [], unionType: 'unknown', status: 'unknown' },
      ],
      filiations: [],
    };

    const result = await commitImport(model);

    expect(result.unionsWritten).toBe(2); // les 2 familles sont bien mappées...
    expect(mock.inserted.unions?.length).toBe(1); // ...mais une seule ligne réellement insérée en base
    // Les 2 partenaires ne doivent être insérés qu'une fois dans union_partners (clé primaire composite)
    expect(mock.inserted.union_partners?.length).toBe(2); // les 2 partenaires, une seule fois chacun (pas 2x)
  });

  it('réutilise une union déjà existante en base plutôt que d\'en recréer une', async () => {
    const existingUnionId = 'union-existing-1';
    mock = makeSupabaseMock({
      individuals: [{ id: 'real-christophe' }, { id: 'real-laetitia' }],
      unions: [{ id: existingUnionId }],
      union_partners: [
        { union_id: existingUnionId, individual_id: 'real-christophe' },
        { union_id: existingUnionId, individual_id: 'real-laetitia' },
      ],
    });
    const { commitImport } = await import('./commitImport.js');

    const model = {
      treeId: 'tree-1',
      importBatchId: 'batch-2',
      places: [],
      sources: [],
      individuals: [
        { localId: 'gedcom:I1', existingId: 'real-christophe', firstNames: 'Christophe', lastName: 'Ternay' },
        { localId: 'gedcom:I2', existingId: 'real-laetitia', firstNames: 'Laetitia', lastName: 'Lalet' },
      ],
      families: [
        { localId: 'gedcom:F1bis', husbandLocalId: 'gedcom:I1', wifeLocalId: 'gedcom:I2', childrenLocalIds: [], unionType: 'marriage', status: 'unknown' },
      ],
      filiations: [],
    };

    await commitImport(model);

    expect(mock.inserted.unions).toBeUndefined(); // aucune nouvelle union créée
    expect(mock.inserted.union_partners).toBeUndefined(); // la paire existe déjà, pas réinsérée
  });
});

describe('commitImport — lieux structurés et unions génériques (import personnalisé)', () => {
  beforeEach(() => {
    mock = makeSupabaseMock();
  });

  it('insère un lieu structuré avec ses 9 champs et compose raw_label/normalized', async () => {
    const { commitImport } = await import('./commitImport.js');
    const model = {
      treeId: 'tree-1',
      importBatchId: 'batch-1',
      places: [{ localId: 'place:1', structured: { city: 'Grasse', postalCode: '06130', country: 'France' } }],
      sources: [],
      individuals: [],
      families: [],
      filiations: [],
    };

    const result = await commitImport(model);

    expect(mock.inserted.places).toHaveLength(1);
    expect(mock.inserted.places[0]).toMatchObject({
      city: 'Grasse', postal_code: '06130', country: 'France',
      raw_label: '06130 Grasse, France',
    });
    expect(result.placeIdMap.get('place:1')).toBeDefined();
  });

  it('garde le comportement raw_label existant pour un lieu sans "structured" (GEDCOM)', async () => {
    const { commitImport } = await import('./commitImport.js');
    const model = {
      treeId: 'tree-1', importBatchId: 'batch-1',
      places: [{ localId: 'place:1', rawLabel: 'Grasse, Alpes-Maritimes, France' }],
      sources: [], individuals: [], families: [], filiations: [],
    };
    await commitImport(model);
    expect(mock.inserted.places[0]).toEqual({
      tree_id: 'tree-1', raw_label: 'Grasse, Alpes-Maritimes, France', normalized: 'grasse, alpes-maritimes, france',
    });
    expect(mock.inserted.places[0].city).toBeUndefined();
  });

  it('crée une union à partir de partnerLocalIds (sans husbandLocalId/wifeLocalId)', async () => {
    mock = makeSupabaseMock({ individuals: [{ id: 'real-a' }, { id: 'real-b' }] });
    const { commitImport } = await import('./commitImport.js');
    const model = {
      treeId: 'tree-1', importBatchId: 'batch-1',
      places: [], sources: [],
      individuals: [
        { localId: 'a', existingId: 'real-a', firstNames: 'A' },
        { localId: 'b', existingId: 'real-b', firstNames: 'B' },
      ],
      families: [{ localId: 'u1', partnerLocalIds: ['a', 'b'], unionType: 'marriage', status: 'ongoing' }],
      filiations: [],
    };

    const result = await commitImport(model);

    expect(mock.inserted.unions).toHaveLength(1);
    expect(mock.inserted.union_partners).toHaveLength(2);
    expect(result.unionIdMap.get('u1')).toBeDefined();
  });

  it('retourne individualIdMap/unionIdMap/placeIdMap en plus des compteurs', async () => {
    mock = makeSupabaseMock({ individuals: [{ id: 'real-a' }] });
    const { commitImport } = await import('./commitImport.js');
    const model = {
      treeId: 'tree-1', importBatchId: 'batch-1',
      places: [], sources: [],
      individuals: [{ localId: 'a', existingId: 'real-a', firstNames: 'A' }],
      families: [], filiations: [],
    };

    const result = await commitImport(model);

    expect(result.individualIdMap).toBeInstanceOf(Map);
    expect(result.individualIdMap.get('a')).toBe('real-a');
    expect(result.unionIdMap).toBeInstanceOf(Map);
    expect(result.placeIdMap).toBeInstanceOf(Map);
  });
});

describe('commitImport — jalons d\'union (mise en couple / mariage / divorce distincts)', () => {
  beforeEach(() => {
    mock = makeSupabaseMock({ individuals: [{ id: 'real-a' }, { id: 'real-b' }] });
  });

  it('avec splitMarriageMilestone, crée un événement "union_start" ET un événement "marriage" distincts, avec le bon lieu de divorce', async () => {
    const { commitImport } = await import('./commitImport.js');
    const model = {
      treeId: 'tree-1', importBatchId: 'batch-1',
      places: [
        { localId: 'p-start', structured: { city: 'Donzenac' } },
        { localId: 'p-marriage', structured: { city: 'Paris' } },
        { localId: 'p-divorce', structured: { city: 'Lyon' } },
      ],
      sources: [],
      individuals: [
        { localId: 'a', existingId: 'real-a', firstNames: 'A' },
        { localId: 'b', existingId: 'real-b', firstNames: 'B' },
      ],
      families: [{
        localId: 'u1', partnerLocalIds: ['a', 'b'], unionType: 'marriage', status: 'divorced',
        startDate: '1920-01-01', startDatePrecision: 'exact', placeLocalId: 'p-start',
        endDate: '1948-06-07', endDatePrecision: 'exact',
        splitMarriageMilestone: true,
        marriageDate: '1930-05-05', marriageDatePrecision: 'exact', marriagePlaceLocalId: 'p-marriage',
        divorcePlaceLocalId: 'p-divorce',
      }],
      filiations: [],
    };

    await commitImport(model);

    const events = mock.inserted.events;
    const unionStart = events.find((e) => e.event_type === 'union_start');
    const marriage = events.find((e) => e.event_type === 'marriage');
    const divorce = events.find((e) => e.event_type === 'divorce');

    expect(unionStart).toMatchObject({ event_date: '1920-01-01', place_id: expect.any(String) });
    expect(marriage).toMatchObject({ event_date: '1930-05-05', place_id: expect.any(String) });
    expect(marriage.place_id).not.toBe(unionStart.place_id);
    expect(divorce).toMatchObject({ event_date: '1948-06-07', place_id: expect.any(String) });
    expect(divorce.place_id).not.toBe(marriage.place_id);
  });

  it('sans splitMarriageMilestone, conserve le comportement historique (un seul événement "marriage" pour startDate)', async () => {
    const { commitImport } = await import('./commitImport.js');
    const model = {
      treeId: 'tree-1', importBatchId: 'batch-1',
      places: [], sources: [],
      individuals: [
        { localId: 'a', existingId: 'real-a', firstNames: 'A' },
        { localId: 'b', existingId: 'real-b', firstNames: 'B' },
      ],
      families: [{
        localId: 'u1', partnerLocalIds: ['a', 'b'], unionType: 'marriage', status: 'ongoing',
        startDate: '1958-07-19', startDatePrecision: 'exact',
      }],
      filiations: [],
    };

    await commitImport(model);

    const events = mock.inserted.events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: 'marriage', event_date: '1958-07-19' });
  });
});
