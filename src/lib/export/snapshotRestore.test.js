import { describe, it, expect } from 'vitest';
import { validateSnapshotShape, summarizeSnapshot } from './snapshotRestore.js';

function validBackup() {
  return {
    format: 'arbre-et-memoire-backup',
    version: 2,
    exportedAt: '2026-01-01T00:00:00.000Z',
    individuals: [{ id: 'i1' }],
    unions: [],
    filiations: [],
    places: [],
    events: [],
    sources: [{ id: 's1' }],
    citations: [],
    media: [],
    pets: [],
  };
}

describe('validateSnapshotShape', () => {
  it('accepte une sauvegarde valide', () => {
    expect(validateSnapshotShape(validBackup())).toEqual([]);
  });

  it('rejette un fichier vide ou illisible', () => {
    expect(validateSnapshotShape(null)).toHaveLength(1);
    expect(validateSnapshotShape(undefined)).toHaveLength(1);
  });

  it("rejette un format inconnu", () => {
    const errors = validateSnapshotShape({ ...validBackup(), format: 'autre-chose' });
    expect(errors.some((e) => e.includes('reconnu'))).toBe(true);
  });

  it('signale les sections manquantes', () => {
    const backup = validBackup();
    delete backup.individuals;
    const errors = validateSnapshotShape(backup);
    expect(errors.some((e) => e.includes('individuals'))).toBe(true);
  });
});

describe('summarizeSnapshot', () => {
  it('compte chaque section', () => {
    const summary = summarizeSnapshot(validBackup());
    expect(summary.individuals).toBe(1);
    expect(summary.sources).toBe(1);
    expect(summary.unions).toBe(0);
    expect(summary.exportedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
