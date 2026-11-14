import { describe, it, expect, vi, beforeEach } from 'vitest';

const attachDateProofMock = vi.fn();
vi.mock('../individual/actsMutations.js', () => ({
  attachDateProof: (...args) => attachDateProofMock(...args),
}));

beforeEach(() => {
  attachDateProofMock.mockReset();
});

describe('attachImportProofs', () => {
  it('résout les localId en vrais UUID via les ID maps avant d\'appeler attachDateProof', async () => {
    attachDateProofMock.mockResolvedValue({ eventId: 'ev-1', sourceId: 'src-1' });
    const { attachImportProofs } = await import('./attachImportProofs.js');

    const proofs = [{
      subjectKind: 'individual', subjectLocalId: 'p1', eventType: 'birth',
      snapshot: { date: '1900-01-01', datePrecision: 'exact', placeLocalId: 'place:1' },
      proof: { type: 'acte', url: 'https://archives/acte', imageFile: null },
      title: 'Acte de naissance — Jean Durand',
    }];
    const idMaps = {
      individualIdMap: new Map([['p1', 'real-ind-1']]),
      unionIdMap: new Map(),
      placeIdMap: new Map([['place:1', 'real-place-1']]),
    };

    const result = await attachImportProofs('tree-1', proofs, idMaps, new Map());

    expect(attachDateProofMock).toHaveBeenCalledWith('tree-1', expect.objectContaining({
      subjectKind: 'individual', subjectId: 'real-ind-1', individualId: 'real-ind-1',
      eventType: 'birth',
      snapshot: { date: '1900-01-01', datePrecision: 'exact', placeId: 'real-place-1' },
      title: 'Acte de naissance — Jean Durand',
      proof: { type: 'acte', url: 'https://archives/acte', file: null, reference: '', repository: '', transcription: '' },
    }));
    expect(result).toEqual({ attached: 1, failed: [] });
  });

  it('transmet reference/repository/transcription quand fournis par le mapper', async () => {
    attachDateProofMock.mockResolvedValue({ eventId: 'ev-1', sourceId: 'src-1' });
    const { attachImportProofs } = await import('./attachImportProofs.js');

    const proofs = [{
      subjectKind: 'union', subjectLocalId: 'u1', eventType: 'divorce',
      snapshot: { date: '1948-06-07', datePrecision: 'exact', placeLocalId: null },
      proof: { type: 'family', transcription: 'Jugement du tribunal civil de la Seine du 07/06/1948.' },
      title: 'Jugement de divorce',
    }];
    const idMaps = { individualIdMap: new Map(), unionIdMap: new Map([['u1', 'real-union-1']]), placeIdMap: new Map() };

    await attachImportProofs('tree-1', proofs, idMaps, new Map());

    expect(attachDateProofMock).toHaveBeenCalledWith('tree-1', expect.objectContaining({
      subjectKind: 'union', subjectId: 'real-union-1', eventType: 'divorce',
      proof: expect.objectContaining({
        type: 'family',
        transcription: 'Jugement du tribunal civil de la Seine du 07/06/1948.',
      }),
    }));
  });

  it("résout le fichier image depuis imagesByPath quand proof.imageFile est fourni", async () => {
    attachDateProofMock.mockResolvedValue({ eventId: 'ev-1', sourceId: 'src-1' });
    const { attachImportProofs } = await import('./attachImportProofs.js');

    const fakeFile = new File(['x'], 'acte.jpg');
    const proofs = [{
      subjectKind: 'individual', subjectLocalId: 'p1', eventType: 'birth',
      snapshot: { date: '1900-01-01', datePrecision: 'exact', placeLocalId: null },
      proof: { type: 'acte', url: '', imageFile: 'images/acte.jpg' },
      title: 'Acte',
    }];
    const idMaps = { individualIdMap: new Map([['p1', 'real-ind-1']]), unionIdMap: new Map(), placeIdMap: new Map() };
    const imagesByPath = new Map([['images/acte.jpg', fakeFile]]);

    await attachImportProofs('tree-1', proofs, idMaps, imagesByPath);

    expect(attachDateProofMock).toHaveBeenCalledWith('tree-1', expect.objectContaining({
      proof: expect.objectContaining({ file: fakeFile }),
    }));
  });

  it('attache une preuve de mariage avec subjectKind "union" et individualId null', async () => {
    attachDateProofMock.mockResolvedValue({ eventId: 'ev-1', sourceId: 'src-1' });
    const { attachImportProofs } = await import('./attachImportProofs.js');

    const proofs = [{
      subjectKind: 'union', subjectLocalId: 'u1', eventType: 'marriage',
      snapshot: { date: '1920-01-01', datePrecision: 'exact', placeLocalId: null },
      proof: { type: 'family' },
      title: 'Acte de mariage',
    }];
    const idMaps = { individualIdMap: new Map(), unionIdMap: new Map([['u1', 'real-union-1']]), placeIdMap: new Map() };

    await attachImportProofs('tree-1', proofs, idMaps, new Map());

    expect(attachDateProofMock).toHaveBeenCalledWith('tree-1', expect.objectContaining({
      subjectKind: 'union', subjectId: 'real-union-1', individualId: null,
    }));
  });

  it('continue après une preuve en échec et la liste dans "failed" sans bloquer les autres', async () => {
    attachDateProofMock
      .mockRejectedValueOnce(new Error('upload échoué'))
      .mockResolvedValueOnce({ eventId: 'ev-2', sourceId: 'src-2' });
    const { attachImportProofs } = await import('./attachImportProofs.js');

    const proofs = [
      {
        subjectKind: 'individual', subjectLocalId: 'p1', eventType: 'birth',
        snapshot: { date: '1900-01-01', datePrecision: 'exact', placeLocalId: null },
        proof: { type: 'acte', imageFile: 'images/manquant.jpg' },
        title: 'Acte de naissance — A',
      },
      {
        subjectKind: 'individual', subjectLocalId: 'p2', eventType: 'birth',
        snapshot: { date: '1905-01-01', datePrecision: 'exact', placeLocalId: null },
        proof: { type: 'family' },
        title: 'Acte de naissance — B',
      },
    ];
    const idMaps = {
      individualIdMap: new Map([['p1', 'real-1'], ['p2', 'real-2']]),
      unionIdMap: new Map(), placeIdMap: new Map(),
    };

    const result = await attachImportProofs('tree-1', proofs, idMaps, new Map());

    expect(result.attached).toBe(1);
    expect(result.failed).toEqual([{ title: 'Acte de naissance — A', error: 'upload échoué' }]);
  });

  it("signale une erreur claire quand le localId ne se résout à aucun UUID", async () => {
    const { attachImportProofs } = await import('./attachImportProofs.js');

    const proofs = [{
      subjectKind: 'individual', subjectLocalId: 'inconnu', eventType: 'birth',
      snapshot: { date: '1900-01-01', datePrecision: 'exact', placeLocalId: null },
      proof: { type: 'family' },
      title: 'Acte de naissance — Inconnu',
    }];
    const idMaps = { individualIdMap: new Map(), unionIdMap: new Map(), placeIdMap: new Map() };

    const result = await attachImportProofs('tree-1', proofs, idMaps, new Map());

    expect(attachDateProofMock).not.toHaveBeenCalled();
    expect(result.attached).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].title).toBe('Acte de naissance — Inconnu');
  });
});
