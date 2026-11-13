import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/ui/Modal.jsx';
import { createPet, updatePet, deletePet, listPetLinks, linkPetToIndividual, unlinkPet } from './petsMutations.js';
import { listPhotosForPet, uploadPhoto, linkMediaToSubject } from '../media/mediaMutations.js';
import { getMediaSignedUrl, deleteMedia } from '../../lib/db/mediaStorage.js';
import IndividualPicker from '../individual/IndividualPicker.jsx';
import PhotoViewer from '../media/PhotoViewer.jsx';

const SEX_OPTIONS = [
  { value: 'M', label: 'Mâle' },
  { value: 'F', label: 'Femelle' },
  { value: 'U', label: 'Non précisé' },
];

/**
 * Fiche détaillée d'un animal : état civil (nom, espèce, race, dates,
 * anecdotes), galerie de photos propres (media_links, subject_kind
 * 'pet') et membres de la famille associés (pet_links). Même structure
 * que SourceDetailModal — création à la volée si `pet` est null.
 */
export default function PetDetailModal({ treeId, pet, canEdit, onClose, onSaved, onDeleted }) {
  const isNew = !pet;
  const [petId, setPetId] = useState(pet?.id || null);
  const [form, setForm] = useState({
    name: pet?.name || '',
    species: pet?.species || '',
    breed: pet?.breed || '',
    sex: pet?.sex || 'U',
    birthDate: pet?.birthDate || '',
    deathDate: pet?.deathDate || '',
    anecdotes: pet?.anecdotes || '',
  });
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [links, setLinks] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(null);
  const fileInputRef = useRef(null);

  async function reloadPhotos(id) {
    setPhotos(await listPhotosForPet(id));
  }
  async function reloadLinks(id) {
    setLinks(await listPetLinks(id));
  }

  useEffect(() => {
    if (!petId) return;
    reloadPhotos(petId);
    reloadLinks(petId);
  }, [petId]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isNew && !petId) {
        const id = await createPet(treeId, form);
        setPetId(id);
      } else {
        await updatePet(petId, form);
      }
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await deletePet(petId);
    onDeleted?.();
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !petId) return;
    setUploading(true);
    try {
      const mediaId = await uploadPhoto(treeId, file, { title: file.name });
      await linkMediaToSubject(mediaId, 'pet', petId);
      await reloadPhotos(petId);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeletePhoto(media) {
    await deleteMedia(media.id, media.storage_path);
    await reloadPhotos(petId);
  }

  async function handleLinkIndividual(person) {
    await linkPetToIndividual(petId, person.id);
    await reloadLinks(petId);
  }

  async function handleUnlink(link) {
    await unlinkPet(petId, link.subjectKind, link.subjectId);
    await reloadLinks(petId);
  }

  return (
    <Modal title={isNew && !petId ? 'Nouvel animal' : pet?.name || 'Animal'} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-neutral-500">
            Nom
            <input required className="field mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="block text-xs text-neutral-500">
            Espèce
            <input className="field mt-1" value={form.species} onChange={(e) => setForm((f) => ({ ...f, species: e.target.value }))} placeholder="chien, chat, cheval…" />
          </label>
          <label className="block text-xs text-neutral-500">
            Race
            <input className="field mt-1" value={form.breed} onChange={(e) => setForm((f) => ({ ...f, breed: e.target.value }))} />
          </label>
          <label className="block text-xs text-neutral-500">
            Sexe
            <select className="field mt-1" value={form.sex} onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value }))}>
              {SEX_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="block text-xs text-neutral-500">
            Date de naissance
            <input type="date" className="field mt-1" value={form.birthDate} onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))} />
          </label>
          <label className="block text-xs text-neutral-500">
            Date de décès
            <input type="date" className="field mt-1" value={form.deathDate} onChange={(e) => setForm((f) => ({ ...f, deathDate: e.target.value }))} />
          </label>
        </div>
        <label className="block text-xs text-neutral-500">
          Anecdotes
          <textarea className="field mt-1" rows={2} value={form.anecdotes} onChange={(e) => setForm((f) => ({ ...f, anecdotes: e.target.value }))} />
        </label>

        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-2">
            {canEdit && (
              <button type="submit" disabled={saving} className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              Fermer
            </button>
          </div>
          {canEdit && petId && (
            <button type="button" onClick={handleDelete} className="text-sm text-red-500 hover:text-red-700">
              Supprimer
            </button>
          )}
        </div>
      </form>

      {petId && (
        <>
          <div className="mt-5 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Photos</h3>
              {canEdit && (
                <label className="cursor-pointer text-xs text-accent-600 hover:underline">
                  {uploading ? 'Envoi…' : '+ Ajouter une photo'}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>
              )}
            </div>
            {photos.length === 0 ? (
              <p className="text-sm text-neutral-400">Aucune photo pour l'instant.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {photos.map((m) => (
                  <PetPhotoThumb key={m.id} media={m} onOpen={() => setViewing(m)} onDelete={canEdit ? () => handleDeletePhoto(m) : null} />
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Membres de la famille associés</h3>
            {links.length === 0 ? (
              <p className="mb-2 text-sm text-neutral-400">Aucun membre associé pour l'instant.</p>
            ) : (
              <ul className="mb-2 space-y-1 text-sm">
                {links.map((l) => (
                  <li key={`${l.subjectKind}:${l.subjectId}`} className="flex items-center justify-between">
                    {l.individual ? (
                      <Link to={`/individus/${l.individual.id}`} className="hover:underline">
                        {l.individual.first_names} {l.individual.last_name}
                      </Link>
                    ) : (
                      <span className="text-neutral-400">Lien inconnu</span>
                    )}
                    {canEdit && (
                      <button onClick={() => handleUnlink(l)} className="text-xs text-red-500 hover:text-red-700">Détacher</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && <IndividualPicker treeId={treeId} excludeIds={links.map((l) => l.subjectId)} placeholder="Associer à une personne…" onSelect={handleLinkIndividual} />}
          </div>
        </>
      )}

      {viewing && (
        <PhotoViewer media={viewing} treeId={treeId} canEdit={canEdit} onClose={() => { setViewing(null); reloadPhotos(petId); }} onChanged={() => reloadPhotos(petId)} onDeleted={() => { setViewing(null); reloadPhotos(petId); }} />
      )}
    </Modal>
  );
}

function PetPhotoThumb({ media, onOpen, onDelete }) {
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
