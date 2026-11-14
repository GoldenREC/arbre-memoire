import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabaseClient.js', () => ({ supabase: {} }));
const { planDuplicateScanRemoval } = await import('./duplicateScans.js');

const scan = (id, sourceId, name, extra = {}) => ({ id, source_id: sourceId, title: name, storage_path: `t/actes/${id}-${name}`, created_at: `2026-01-0${id.slice(-1)}`, ...extra });

describe('planDuplicateScanRemoval', () => {
  it('garde un seul exemplaire du même fichier sur une même source (le plus ancien)', () => {
    const rows = [scan('m1', 's1', 'acte.jpg'), scan('m2', 's1', 'acte.jpg'), scan('m3', 's1', 'acte.jpg')];
    const sizes = new Map(rows.map((r) => [r.storage_path, 5000]));
    expect(planDuplicateScanRemoval(rows, sizes).map((m) => m.id)).toEqual(['m2', 'm3']);
  });

  it('garde en priorité celui qui porte une transcription', () => {
    const rows = [scan('m1', 's1', 'acte.jpg'), scan('m2', 's1', 'acte.jpg', { description: 'Texte transcrit' })];
    const sizes = new Map(rows.map((r) => [r.storage_path, 5000]));
    expect(planDuplicateScanRemoval(rows, sizes).map((m) => m.id)).toEqual(['m1']);
  });

  it('ne touche pas à deux fichiers de même nom mais de poids différent, ni à deux sources différentes', () => {
    const rows = [scan('m1', 's1', 'page.jpg'), scan('m2', 's1', 'page.jpg'), scan('m3', 's2', 'page.jpg')];
    const sizes = new Map([[rows[0].storage_path, 5000], [rows[1].storage_path, 7000], [rows[2].storage_path, 5000]]);
    expect(planDuplicateScanRemoval(rows, sizes)).toEqual([]);
  });

  it('ne supprime rien quand le poids est inconnu', () => {
    const rows = [scan('m1', 's1', 'acte.jpg'), scan('m2', 's1', 'acte.jpg')];
    expect(planDuplicateScanRemoval(rows, new Map())).toEqual([]);
  });
});
