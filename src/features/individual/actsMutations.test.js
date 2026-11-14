import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Même mock minimal que individualMutations.test.js / commitImport.test.js
 * (une "mémoire" en mémoire par table), étendu aux tables events/sources/
 * citations nécessaires à attachDateProof. Les deux cas testés ici
 * (acte avec seule url, et information familiale) n'envoient pas de
 * fichier : uploadMediaFile (Supabase Storage) n'est donc jamais appelé
 * et n'a pas besoin d'être mocké.
 */
function makeSupabaseMock(initial = {}) {
  const tables = { events: [], sources: [], citations: [], ...initial };

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
        this._insertedRows = arr.map((r, i) => ({ id: `${table}-new-${tables[table].length + i}`, ...r }));
        tables[table] = tables[table].concat(this._insertedRows);
        return this;
      },
      update(patch) {
        this._update = patch;
        return this;
      },
      then(resolve) {
        if (this._insertedRows) {
          resolve({ data: this._single ? this._insertedRows[0] : this._insertedRows, error: null });
          return;
        }
        if (this._update) {
          const idFilter = this._filters.find(([c]) => c === 'id');
          const idx = tables[table].findIndex((r) => r.id === idFilter?.[1]);
          if (idx >= 0) tables[table][idx] = { ...tables[table][idx], ...this._update };
          resolve({ data: null, error: null });
          return;
        }
        let rows = tables[table] || [];
        for (const [col, val] of this._filters) rows = rows.filter((r) => r[col] === val);
        resolve({ data: this._single ? (rows[0] || null) : rows, error: null });
      },
    };
    return b;
  }

  return { supabase: { from: (t) => builder(t) }, tables };
}

let mock;
vi.mock('../../lib/supabaseClient.js', () => ({
  get supabase() { return mock.supabase; },
}));

beforeEach(() => {
  mock = makeSupabaseMock();
});

describe('attachDateProof', () => {
  it('classe un acte avec permalien en source "civil_record", preuve "proven_secondary"', async () => {
    const { attachDateProof } = await import('./actsMutations.js');
    const { eventId, sourceId } = await attachDateProof('tree-1', {
      subjectKind: 'individual',
      subjectId: 'ind-1',
      individualId: 'ind-1',
      eventType: 'birth',
      snapshot: { date: '1900-05-12', datePrecision: 'exact', placeId: null },
      title: 'Acte de naissance — Jean Durand',
      proof: { type: 'acte', url: 'https://archives.example.org/acte123', file: null },
    });

    const source = mock.tables.sources.find((s) => s.id === sourceId);
    expect(source.source_type).toBe('civil_record');
    expect(source.url).toBe('https://archives.example.org/acte123');

    const event = mock.tables.events.find((e) => e.id === eventId);
    expect(event.proof_level).toBe('proven_secondary');

    expect(mock.tables.citations[0]).toMatchObject({ event_id: eventId, source_id: sourceId, individual_id: 'ind-1' });
  });

  it('classe une information familiale en source "family_data", preuve "probable"', async () => {
    const { attachDateProof } = await import('./actsMutations.js');
    const { eventId, sourceId } = await attachDateProof('tree-1', {
      subjectKind: 'individual',
      subjectId: 'ind-2',
      individualId: 'ind-2',
      eventType: 'death',
      snapshot: { date: '1995-02-03', datePrecision: 'exact', placeId: null },
      title: 'Acte de décès — Marie Martin',
      proof: { type: 'family', url: '', file: null },
    });

    const source = mock.tables.sources.find((s) => s.id === sourceId);
    expect(source.source_type).toBe('family_data');
    expect(source.url).toBeNull();

    const event = mock.tables.events.find((e) => e.id === eventId);
    expect(event.proof_level).toBe('probable');
  });

  it('transmet reference/repository (source) et transcription (citation) quand fournis', async () => {
    const { attachDateProof } = await import('./actsMutations.js');
    const { eventId, sourceId } = await attachDateProof('tree-1', {
      subjectKind: 'individual',
      subjectId: 'ind-4',
      individualId: 'ind-4',
      eventType: 'birth',
      snapshot: { date: '1905-02-23', datePrecision: 'exact', placeId: null },
      title: 'Acte de naissance — Charles Ternay',
      proof: {
        type: 'acte',
        file: null,
        repository: 'Archives de Paris',
        reference: '15e arr., acte n°392 du 26/02/1905',
        transcription: 'Déclaré par Joseph Ternay (père). Témoins : Louis Fontanie, Émile Van Accempt.',
      },
    });

    const source = mock.tables.sources.find((s) => s.id === sourceId);
    expect(source.repository).toBe('Archives de Paris');
    expect(source.call_number).toBe('15e arr., acte n°392 du 26/02/1905');

    const citation = mock.tables.citations.find((c) => c.event_id === eventId);
    expect(citation.transcription).toBe('Déclaré par Joseph Ternay (père). Témoins : Louis Fontanie, Émile Van Accempt.');
  });

  it('réutilise un événement déjà existant plutôt que d\'en recréer un', async () => {
    mock.tables.events.push({ id: 'ev-existing', subject_kind: 'individual', subject_id: 'ind-3', event_type: 'birth' });
    const { attachDateProof } = await import('./actsMutations.js');
    const { eventId } = await attachDateProof('tree-1', {
      subjectKind: 'individual',
      subjectId: 'ind-3',
      individualId: 'ind-3',
      eventType: 'birth',
      snapshot: { date: '1930-01-01', datePrecision: 'exact', placeId: null },
      title: 'Acte de naissance',
      proof: { type: 'family', url: '', file: null },
    });
    expect(eventId).toBe('ev-existing');
    expect(mock.tables.events.filter((e) => e.subject_id === 'ind-3')).toHaveLength(1);
  });
});

describe('attachDateProof — pas de source en double', () => {
  it("réutilise la source identique déjà citée par l'événement au lieu d'en créer une jumelle", async () => {
    mock = makeSupabaseMock();
    const { attachDateProof } = await import('./actsMutations.js');
    const args = {
      subjectId: 'ind-1', individualId: 'ind-1', eventType: 'death',
      snapshot: { date: '1979-02-25', datePrecision: 'exact', placeId: null },
      title: 'Acte de décès — Charles Ternay',
      proof: { type: 'family', url: '', file: null },
    };
    const first = await attachDateProof('tree-1', args);
    const second = await attachDateProof('tree-1', args);
    expect(second.sourceId).toBe(first.sourceId);
    expect(second.reused).toBe(true);
    expect(mock.tables.sources).toHaveLength(1);
    expect(mock.tables.citations).toHaveLength(1);
  });

  it('crée bien une nouvelle source quand la preuve diffère', async () => {
    mock = makeSupabaseMock();
    const { attachDateProof } = await import('./actsMutations.js');
    const base = { subjectId: 'ind-1', individualId: 'ind-1', eventType: 'death', snapshot: {}, title: 'Acte de décès — Charles Ternay' };
    await attachDateProof('tree-1', { ...base, proof: { type: 'family', url: '', file: null } });
    await attachDateProof('tree-1', { ...base, proof: { type: 'acte', url: 'https://archives.example.org/acte', file: null } });
    expect(mock.tables.sources).toHaveLength(2);
  });
});
