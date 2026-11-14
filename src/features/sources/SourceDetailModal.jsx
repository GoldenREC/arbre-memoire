import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/ui/Modal.jsx';
import { createSource, updateSource, deleteSource, listMediaForSource, listCitationsForSource } from './sourcesMutations.js';
import { uploadMediaFile, getMediaSignedUrl, deleteMedia } from '../../lib/db/mediaStorage.js';
import { EVENT_TYPE_LABELS } from '../individual/EventForm.jsx';
import { PROOF_LEVEL_LABELS, proofLevelBadgeClass } from '../../lib/utils/proofLevel.js';
import { SOURCE_TYPES, isUnreliableSourceUrl } from '../../lib/utils/sourceReliability.js';
import ActViewer from './ActViewer.jsx';
import { pushToast, pushErrorToast } from '../../store/useToastStore.js';
import { refreshProofLevelsForSource } from '../../lib/db/proofLevelSync.js';

/**
 * Modale de détail d'une source : champs (titre, dépôt, cote, URL,
 * notes), galerie des actes scannés qui lui sont attachés (upload +
 * ouverture dans ActViewer), et liste des citations qui l'utilisent
 * comme preuve, avec leur indice de fiabilité.
 */
export default function SourceDetailModal({ treeId, source, canEdit, onClose, onSaved, onDeleted }) {
  const isNew = !source;
  const [form, setForm] = useState({
    title: source?.title || '',
    repository: source?.repository || '',
    callNumber: source?.call_number || '',
    url: source?.url || '',
    notes: source?.notes || '',
    sourceType: source?.source_type || '',
  });
  const [saving, setSaving] = useState(false);
  const urlUnreliable = isUnreliableSourceUrl(form.url);
  const [media, setMedia] = useState([]);
  const [citations, setCitations] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [sourceId, setSourceId] = useState(source?.id || null);

  useEffect(() => {
    if (!sourceId) return;
    listMediaForSource(sourceId).then(setMedia);
    // Rattrapage à l'ouverture : relève l'indice de preuve des événements
    // cités si la source le justifie (cas des preuves ajoutées avant cette règle).
    (canEdit ? refreshProofLevelsForSource(sourceId).catch(() => 0) : Promise.resolve(0))
      .then(() => listCitationsForSource(sourceId))
      .then(setCitations);
  }, [sourceId]);

  async function handleSave(e) {
    e.preventDefault();
    if (urlUnreliable) return; // garde-fou en plus du bouton désactivé (ex: soumission via Entrée)
    setSaving(true);
    try {
      if (isNew && !sourceId) {
        const id = await createSource(treeId, form);
        setSourceId(id);
      } else {
        await updateSource(sourceId, form);
        // Le type ou le lien ont pu changer : l'indice de preuve des
        // événements qui citent cette source est relevé en conséquence.
        await refreshProofLevelsForSource(sourceId);
        setCitations(await listCitationsForSource(sourceId));
      }
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  // Suppression en deux clics (pas de fenêtre du navigateur) : le premier
  // arme le bouton et annonce ce qui partira, le second supprime.
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteSource(sourceId);
      pushToast('Source supprimée.');
      onDeleted?.();
    } catch (err) {
      pushErrorToast(err.message || 'La suppression a échoué.');
      setDeleting(false);
      setDeleteArmed(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !sourceId) return;
    setUploading(true);
    try {
      await uploadMediaFile(treeId, file, { mediaType: 'document', sourceId, title: file.name });
      setMedia(await listMediaForSource(sourceId));
      // Un scan vient d'être joint : un acte devient "prouvé par acte original".
      await refreshProofLevelsForSource(sourceId);
      setCitations(await listCitationsForSource(sourceId));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteMedia(m) {
    await deleteMedia(m.id, m.storage_path);
    setMedia((prev) => prev.filter((x) => x.id !== m.id));
  }

  return (
    <Modal title={isNew && !sourceId ? 'Nouvelle source' : 'Source'} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-3">
        <label className="block text-xs text-neutral-500">
          Titre
          <input required className="field mt-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="ex: Registre paroissial de Grasse 1812" />
        </label>
        <label className="block text-xs text-neutral-500">
          Type de source
          <select required className="field mt-1" value={form.sourceType} onChange={(e) => setForm((f) => ({ ...f, sourceType: e.target.value }))}>
            <option value="" disabled>Choisir un type…</option>
            {SOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-neutral-500">
            Dépôt / archives
            <input className="field mt-1" value={form.repository} onChange={(e) => setForm((f) => ({ ...f, repository: e.target.value }))} placeholder="Archives départementales 06" />
          </label>
          <label className="block text-xs text-neutral-500">
            Cote
            <input className="field mt-1" value={form.callNumber} onChange={(e) => setForm((f) => ({ ...f, callNumber: e.target.value }))} />
          </label>
        </div>
        <label className="block text-xs text-neutral-500">
          URL
          <input className="field mt-1" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://..." />
        </label>
        {urlUnreliable && (
          <p className="-mt-2 text-xs text-red-500">
            Cette URL pointe vers un site d'arbre généalogique collaboratif (Geneanet, MyHeritage, Ancestry...), pas une preuve primaire. Remplace-la par un permalien d'archive, ou laisse le champ vide, pour pouvoir enregistrer.
          </p>
        )}
        <label className="block text-xs text-neutral-500">
          Notes
          <textarea className="field mt-1" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </label>

        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-2">
            {canEdit && (
              <button type="submit" disabled={saving || urlUnreliable} title={urlUnreliable ? "Corrige l'URL avant d'enregistrer" : undefined} className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              Fermer
            </button>
          </div>
          {canEdit && sourceId && (
            <button type="button" onClick={handleDelete} disabled={deleting} className="text-right text-sm text-red-500 hover:text-red-700 disabled:opacity-60">
              {deleting
                ? 'Suppression…'
                : deleteArmed
                  ? `Confirmer : supprimer la source${media.length ? `, ses ${media.length} scan(s)` : ''}${citations.length ? ` et ${citations.length} rattachement(s)` : ''}`
                  : 'Supprimer la source'}
            </button>
          )}
        </div>
      </form>

      {sourceId && (
        <>
          <div className="mt-5 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Actes scannés</h3>
              {canEdit && (
                <label className="cursor-pointer text-xs text-accent-600 hover:underline">
                  {uploading ? 'Envoi…' : '+ Ajouter une image'}
                  <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>
              )}
            </div>
            {media.length === 0 ? (
              <p className="text-sm text-neutral-400">Aucun acte scanné pour l'instant.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {media.map((m) => (
                  <ActThumbnail key={m.id} media={m} onOpen={() => setViewing(m)} onDelete={canEdit ? () => handleDeleteMedia(m) : null} />
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Utilisée pour</h3>
            {citations.length === 0 ? (
              <p className="text-sm text-neutral-400">Aucune citation pour l'instant.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {citations.map((c) => (
                  <li key={c.id} className="flex items-center gap-1.5">
                    {c.individual ? (
                      <Link to={`/individus/${c.individual.id}`} className="hover:underline">
                        {c.individual.first_names} {c.individual.last_name}
                      </Link>
                    ) : (
                      <span className="text-neutral-400">Individu inconnu</span>
                    )}
                    {c.event && <span className="text-neutral-400">— {c.event.label || EVENT_TYPE_LABELS[c.event.event_type]}</span>}
                    {c.proofLevel && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${proofLevelBadgeClass(c.proofLevel)}`}>
                        {PROOF_LEVEL_LABELS[c.proofLevel]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {viewing && (
        <ActViewer
          media={viewing}
          mediaList={media}
          canEdit={canEdit}
          onClose={() => setViewing(null)}
          onChanged={() => listMediaForSource(sourceId).then(setMedia)}
        />
      )}
    </Modal>
  );
}

function ActThumbnail({ media, onOpen, onDelete }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    getMediaSignedUrl(media.storage_path).then(setUrl).catch(() => setUrl(null));
  }, [media.storage_path]);

  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      {url ? (
        <img src={url} alt={media.title || ''} className="h-full w-full cursor-pointer object-cover" onClick={onOpen} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-xs text-neutral-400 dark:bg-neutral-800">…</div>
      )}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white group-hover:flex"
        >
          ✕
        </button>
      )}
    </div>
  );
}
