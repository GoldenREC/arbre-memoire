import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import ActViewer from '../sources/ActViewer.jsx';
import { listActsForEvent, attachNewAct, attachExistingSource, detachCitation } from './actsMutations.js';
import { listSources } from '../sources/sourcesMutations.js';
import { ensureEvent, updateEventProofLevel } from './individualMutations.js';
import { getMediaSignedUrl } from '../../lib/db/mediaStorage.js';
import { PROOF_LEVELS } from '../../lib/utils/proofLevel.js';
import { pushToast, pushErrorToast } from '../../store/useToastStore.js';

/**
 * Modale d'attache/gestion des actes pour une pastille N, M ou D :
 * liste les actes déjà rattachés à l'événement (naissance, mariage ou
 * décès), permet d'en créer un nouveau (source + upload en une seule
 * étape) ou d'en lier un déjà existant, et expose l'indice de preuve
 * de l'événement. Si l'événement n'existe pas encore (individu saisi
 * à la main, sans ligne `events` pour sa naissance/décès), il est créé
 * à la volée au premier acte effectivement rattaché (voir ensureEvent).
 */
export default function EventActsModal({
  title,
  treeId,
  individualId,
  subjectKind,
  subjectId,
  eventType,
  eventId: initialEventId,
  proofLevel: initialProofLevel,
  fallbackSnapshot,
  defaultTitle,
  canEdit,
  onClose,
  onChanged,
}) {
  const [eventId, setEventId] = useState(initialEventId);
  const [proofLevel, setProofLevel] = useState(initialProofLevel || 'hypothesis');
  const [acts, setActs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(null); // null | 'new' | 'existing'
  const [newTitle, setNewTitle] = useState(defaultTitle || '');
  const [sources, setSources] = useState([]);
  const [existingSourceId, setExistingSourceId] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState(null);
  const fileInputRef = useRef(null);

  async function reloadActs(id) {
    setActs(await listActsForEvent(id));
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (eventId) await reloadActs(eventId);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function withEventId() {
    if (eventId) return eventId;
    const id = await ensureEvent(treeId, subjectKind, subjectId, eventType, fallbackSnapshot || {});
    setEventId(id);
    return id;
  }

  async function handleCreateAndAttach(e) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const id = await withEventId();
      await attachNewAct(treeId, {
        eventId: id,
        individualId: subjectKind === 'individual' ? individualId : null,
        title: newTitle.trim() || file.name,
        file,
      });
      await reloadActs(id);
      setMode(null);
      setNewTitle(defaultTitle || '');
      if (fileInputRef.current) fileInputRef.current.value = '';
      onChanged?.();
      pushToast('Acte rattaché.');
    } catch (err) {
      pushErrorToast(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function openExistingPicker() {
    setMode('existing');
    setSources(await listSources(treeId));
  }

  async function handleAttachExisting(e) {
    e.preventDefault();
    if (!existingSourceId) return;
    setSaving(true);
    try {
      const id = await withEventId();
      await attachExistingSource(treeId, {
        eventId: id,
        individualId: subjectKind === 'individual' ? individualId : null,
        sourceId: existingSourceId,
      });
      await reloadActs(id);
      setMode(null);
      setExistingSourceId('');
      onChanged?.();
      pushToast('Acte rattaché.');
    } catch (err) {
      pushErrorToast(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDetach(citationId) {
    try {
      await detachCitation(citationId);
      await reloadActs(eventId);
      onChanged?.();
      pushToast('Acte détaché.');
    } catch (err) {
      pushErrorToast(err.message);
    }
  }

  async function handleProofLevelChange(value) {
    const previous = proofLevel;
    setProofLevel(value);
    try {
      const id = await withEventId();
      await updateEventProofLevel(id, value);
      onChanged?.();
      pushToast('Indice de preuve mis à jour.');
    } catch (err) {
      setProofLevel(previous);
      pushErrorToast(err.message);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-xs text-neutral-500">
          Indice de preuve
          <select
            className="field mt-1"
            value={proofLevel}
            disabled={!canEdit}
            onChange={(e) => handleProofLevelChange(e.target.value)}
          >
            {PROOF_LEVELS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Actes rattachés</h3>
          {loading ? (
            <p className="text-sm text-neutral-400">Chargement…</p>
          ) : acts.length === 0 ? (
            <p className="text-sm text-neutral-400">Aucun acte rattaché pour l'instant.</p>
          ) : (
            <ul className="space-y-2">
              {acts.map((act) => (
                <li key={act.id} className="rounded-xl border border-neutral-200 p-2 dark:border-neutral-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{act.source?.title || 'Source'}</span>
                    {canEdit && (
                      <button onClick={() => handleDetach(act.id)} className="text-xs text-red-500 hover:text-red-700">
                        Détacher
                      </button>
                    )}
                  </div>
                  {act.media.length > 0 ? (
                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                      {act.media.map((m) => (
                        <ActThumbnailMini key={m.id} media={m} onOpen={() => setViewing({ media: m, list: act.media })} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-neutral-400">Source sans image scannée.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {canEdit && (
          <div className="border-t border-neutral-100 pt-3 dark:border-neutral-800">
            {mode === 'new' ? (
              <form onSubmit={handleCreateAndAttach} className="space-y-2">
                <input className="field" placeholder="Titre de l'acte" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="field" />
                <div className="flex gap-2">
                  <button type="submit" disabled={saving} className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60">
                    {saving ? 'Envoi…' : 'Rattacher'}
                  </button>
                  <button type="button" onClick={() => setMode(null)} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    Annuler
                  </button>
                </div>
              </form>
            ) : mode === 'existing' ? (
              <form onSubmit={handleAttachExisting} className="space-y-2">
                {sources.length === 0 ? (
                  <p className="text-xs text-neutral-400">Aucune source n'a encore été créée dans cet arbre.</p>
                ) : (
                  <select className="field" value={existingSourceId} onChange={(e) => setExistingSourceId(e.target.value)}>
                    <option value="">— Choisir une source —</option>
                    {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                )}
                <div className="flex gap-2">
                  <button type="submit" disabled={saving || !existingSourceId} className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60">
                    Lier
                  </button>
                  <button type="button" onClick={() => setMode(null)} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex gap-3 text-xs">
                <button onClick={() => setMode('new')} className="text-accent-600 hover:underline">
                  + Créer et rattacher un acte
                </button>
                <button onClick={openExistingPicker} className="text-accent-600 hover:underline">
                  + Lier une source existante
                </button>
              </div>
            )}
          </div>
        )}

        <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          Fermer
        </button>
      </div>

      {viewing && (
        <ActViewer
          media={viewing.media}
          mediaList={viewing.list}
          canEdit={canEdit}
          onClose={() => setViewing(null)}
          onChanged={() => reloadActs(eventId)}
        />
      )}
    </Modal>
  );
}

function ActThumbnailMini({ media, onOpen }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    getMediaSignedUrl(media.storage_path).then(setUrl).catch(() => setUrl(null));
  }, [media.storage_path]);

  return (
    <div className="aspect-square overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      {url ? (
        <img src={url} alt={media.title || ''} className="h-full w-full cursor-pointer object-cover" onClick={onOpen} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-xs text-neutral-400 dark:bg-neutral-800">…</div>
      )}
    </div>
  );
}
