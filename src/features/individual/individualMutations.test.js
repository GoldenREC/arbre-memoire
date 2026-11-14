import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mock minimal mais fidèle du client Supabase, dans le même esprit que
 * lib/db/commitImport.test.js : chaque table a une "mémoire" en mémoire,
 * ce qui permet de simuler un état existant (ex. un lieu déjà enregistré)
 * et d'observer ce qui a réellement été envoyé en insert/upsert.
 */
function makeSupabaseMock(initial = {}) {
  const tables = { places: [], individuals: [], filiations: [], ...initial };
  const inserted = {};
  const upserted = {};

  function builder(table) {
    const b = {
      _filters: [],
      select() { return this; },
      eq(col, val) { this._filters.push([col, val]); return this; },
      limit() { return this; },
      maybeSingle() { this._single = true; return this; },
      single() { this._single = true; return this; },
      insert(rows) {
        const arr = Array.isArray(rows) ? rows : [rows];
        inserted[table] = (inserted[table] || []).concat(arr);
        this._insertedRows = arr.map((r, i) => ({ id: `${table}-new-${tables[table].length + i}`, ...r }));
        tables[table] = tables[table].concat(this._insertedRows);
        return this;
      },
      upsert(rows, opts) {
        const arr = Array.isArray(rows) ? rows : [rows];
        upserted[table] = (upserted[table] || []).concat(arr);
        tables[table] = tables[table].concat(arr.map((r, i) => ({ id: `${table}-new-${tables[table].length + i}`, ...r })));
        return this;
      },
      then(resolve) {
        if (this._insertedRows) {
          resolve({ data: this._single ? this._insertedRows[0] : this._insertedRows, error: null });
          return;
        }
        let rows = tables[table] || [];
        for (const [col, val] of this._filters) rows = rows.filter((r) => r[col] === val);
        resolve({ data: this._single ? (rows[0] || null) : rows, error: null });
      },
    };
    return b;
  }

  return { supabase: { from: (t) => builder(t) }, tables, inserted, upserted };
}

let mock;
vi.mock('../../lib/supabaseClient.js', () => ({
  get supabase() { return mock.supabase; },
}));

beforeEach(() => {
  mock = makeSupabaseMock();
});

describe('createIndividualFull — nom de naissance / nom marital', () => {
  it('utilise le nom marital comme nom d\'usage pour une femme qui en fournit un', async () => {
    const { createIndividualFull } = await import('./individualMutations.js');
    const created = await createIndividualFull('tree-1', {
      firstNames: 'marie', birthName: 'durand', maritalLastName: 'martin', sex: 'F',
    });
    expect(created.last_name).toBe('Martin');
    expect(mock.inserted.individuals[0].birth_name).toBe('Durand');
  });

  it('retombe sur le nom de naissance quand aucun nom marital n\'est fourni', async () => {
    const { createIndividualFull } = await import('./individualMutations.js');
    const created = await createIndividualFull('tree-1', { firstNames: 'Marie', birthName: 'Durand', sex: 'F' });
    expect(created.last_name).toBe('Durand');
  });

  it('ignore le nom marital pour un homme', async () => {
    const { createIndividualFull } = await import('./individualMutations.js');
    const created = await createIndividualFull('tree-1', {
      firstNames: 'Jean', birthName: 'Durand', maritalLastName: 'Martin', sex: 'M',
    });
    expect(created.last_name).toBe('Durand');
  });
});

describe('findOrCreateStructuredPlace', () => {
  it('renvoie null pour un lieu entièrement vide', async () => {
    const { findOrCreateStructuredPlace } = await import('./individualMutations.js');
    expect(await findOrCreateStructuredPlace('tree-1', null)).toBeNull();
    expect(await findOrCreateStructuredPlace('tree-1', { city: '', country: '' })).toBeNull();
  });

  it('crée un lieu avec ses champs structurés et un raw_label composé', async () => {
    const { findOrCreateStructuredPlace } = await import('./individualMutations.js');
    const id = await findOrCreateStructuredPlace('tree-1', {
      city: 'Cagnes-sur-Mer', department: 'Alpes-Maritimes', region: 'Provence-Alpes-Côte d\'Azur', country: 'France',
    });
    expect(id).toMatch(/^places-new-/);
    const row = mock.inserted.places[0];
    expect(row.city).toBe('Cagnes-sur-Mer');
    expect(row.raw_label).toBe('Cagnes-sur-Mer, Alpes-Maritimes, Provence-Alpes-Côte d\'Azur, France');
  });

  it('réutilise un lieu existant au lieu d\'en recréer un (même libellé normalisé)', async () => {
    mock = makeSupabaseMock({
      places: [{ id: 'place-existing', tree_id: 'tree-1', normalized: 'cagnes-sur-mer, france' }],
    });
    const { findOrCreateStructuredPlace } = await import('./individualMutations.js');
    const id = await findOrCreateStructuredPlace('tree-1', { city: 'Cagnes-sur-Mer', country: 'France' });
    expect(id).toBe('place-existing');
    expect(mock.inserted.places).toBeUndefined();
  });
});

describe('linkAsSibling', () => {
  it('reprend les parents existants de la personne choisie, union comprise', async () => {
    mock = makeSupabaseMock({
      filiations: [
        { id: 'f1', child_id: 'existing-person', parent_id: 'parent-a', union_id: 'union-1' },
        { id: 'f2', child_id: 'existing-person', parent_id: 'parent-b', union_id: 'union-1' },
      ],
    });
    const { linkAsSibling } = await import('./individualMutations.js');
    const count = await linkAsSibling('tree-1', 'new-person', 'existing-person');
    expect(count).toBe(2);
    expect(mock.upserted.filiations).toEqual([
      { tree_id: 'tree-1', child_id: 'new-person', parent_id: 'parent-a', filiation_type: 'biological', union_id: 'union-1' },
      { tree_id: 'tree-1', child_id: 'new-person', parent_id: 'parent-b', filiation_type: 'biological', union_id: 'union-1' },
    ]);
  });

  it('ne fait rien quand la personne choisie n\'a aucun parent connu', async () => {
    const { linkAsSibling } = await import('./individualMutations.js');
    const count = await linkAsSibling('tree-1', 'new-person', 'existing-person');
    expect(count).toBe(0);
    expect(mock.upserted.filiations).toBeUndefined();
  });
});
