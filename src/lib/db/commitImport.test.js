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
