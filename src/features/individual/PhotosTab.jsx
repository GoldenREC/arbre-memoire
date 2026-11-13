import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPhotosForIndividual, uploadPhoto, linkMediaToSubject } from '../media/mediaMutations.js';
import { getMediaSignedUrl } from '../../lib/db/mediaStorage.js';
import PhotoViewer from '../media/PhotoViewer.jsx';
import { listPetsForIndividual, createPet, linkPetToIndividual } from '../pets/petsMutations.js';
import PetPicker from '../pets/PetPicker.jsx';
import PetDetailModal from '../pets/PetDetailModal.jsx';

/**
 * Onglet "Photos & animaux" de la fiche individu : photos où cette
 * personne a été identifiée (tag ou rattachement direct), animaux de
 * compagnie associés, et un lien rapide vers son parcours de vie sur
 * la carte (réutilise le traçage de chemins de migration de la Phase
 * Carte plutôt que de le dupliquer ici).
 */
export default function PhotosTab({ individual, canEdit }) {
  const treeId = individual.treeId;
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const [pets, setPets] = useState([]);
  const [openingPet, setOpeningPet] = useState(null); // pet | 'new' | null
  const [creatingPet, setCreatingPet] = useState(false);
  const [newPetName, setNewPetName] = useState('');
  const [newPetSpecies, setNewPetSpecies] = useState('');

  async function reloadPhotos() {
    setLoading(true);
    setPhotos(await listPhotosForIndividual(individual.id));
    setLoading(false);
  }
  async function reloadPets() {
    setPets(await listPetsForIndividual(individual.id));
  }

  useEffect(() => {
    reloadPhotos();
    reloadPets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [individual.id]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const mediaId = await uploadPhoto(treeId, file, { title: file.name });
      await linkMediaToSubject(mediaId, 'individual', individual.id);
      await reloadPhotos();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleLinkExistingPet(pet) {
    await linkPetToIndividual(pet.id, individual.id);
    await reloadPets();
  }

  async function handleCreatePet(e) {
    e.preventDefault();
    if (!newPetName.trim()) return;
    const petId = await createPet(treeId, { name: newPetName.trim(), species: newPetSpecies.trim() || null });
    await linkPetToIndividual(petId, individual.id);
    setNewPetName('');
    setNewPetSpecies('');
    setCreatingPet(false);
    await reloadPets();
  }

  const lifePathHref = `/carte?individual=${individual.id}&name=${encodeURIComponent(`${individual.firstNames || ''} ${individual.lastName || ''}`.trim())}`;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Photos</h3>
          {canEdit && (
            <label className="cursor-pointer text-xs text-accent-600 hover:underline">
              {uploading ? 'Envoi…' : '+ Ajouter une photo de cette personne'}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-neutral-400">Chargement…</p>
        ) : photos.length === 0 ? (
          <p className="text-sm text-neutral-400">Aucune photo pour l'instant.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photos.map((media) => (
              <PhotoThumb key={media.id} media={media} onOpen={() => setViewing(media)} />
            ))}
          </div>
        )}

        <Link to="/photos" className="mt-2 inline-block text-xs text-accent-600 hover:underline">
          Ouvrir la galerie complète →
        </Link>
      </div>

      <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Animaux de compagnie</h3>
        {pets.length === 0 ? (
          <p className="mb-2 text-sm text-neutral-400">Aucun animal associé.</p>
        ) : (
          <ul className="mb-2 space-y-1">
            {pets.map((pet) => (
              <li key={pet.id}>
                <button onClick={() => setOpeningPet(pet)} className="text-sm hover:underline">
                  🐾 {pet.name}{pet.species ? ` — ${pet.species}` : ''}
                </button>
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="flex flex-wrap items-start gap-3">
            <div className="w-56">
              <PetPicker treeId={treeId} excludeIds={pets.map((p) => p.id)} placeholder="Associer un animal existant…" onSelect={handleLinkExistingPet} />
            </div>
            {creatingPet ? (
              <form onSubmit={handleCreatePet} className="flex flex-wrap items-center gap-2">
                <input className="field w-36" placeholder="Nom" value={newPetName} onChange={(e) => setNewPetName(e.target.value)} />
                <input className="field w-32" placeholder="Espèce" value={newPetSpecies} onChange={(e) => setNewPetSpecies(e.target.value)} />
                <button type="submit" className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700">Créer</button>
                <button type="button" onClick={() => setCreatingPet(false)} className="text-xs text-neutral-400 hover:text-neutral-600">Annuler</button>
              </form>
            ) : (
              <button onClick={() => setCreatingPet(true)} className="text-xs text-accent-600 hover:underline">+ Nouvel animal</button>
            )}
          </div>
        )}
        <Link to="/animaux" className="mt-2 inline-block text-xs text-accent-600 hover:underline">
          Ouvrir le module Animaux →
        </Link>
      </div>

      <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
        <Link to={lifePathHref} className="text-sm text-accent-600 hover:underline">
          🗺️ Voir le parcours de vie sur la carte →
        </Link>
      </div>

      {viewing && (
        <PhotoViewer
          media={viewing}
          treeId={treeId}
          canEdit={canEdit}
          onClose={() => { setViewing(null); reloadPhotos(); }}
          onChanged={reloadPhotos}
          onDeleted={() => { setViewing(null); reloadPhotos(); }}
          onNavigate={(dir) => {
            const idx = photos.findIndex((m) => m.id === viewing.id);
            const next = photos[idx + dir];
            if (next) setViewing(next);
          }}
        />
      )}

      {openingPet && (
        <PetDetailModal
          treeId={treeId}
          pet={openingPet}
          canEdit={canEdit}
          onClose={() => setOpeningPet(null)}
          onSaved={reloadPets}
          onDeleted={() => { setOpeningPet(null); reloadPets(); }}
        />
      )}
    </div>
  );
}

function PhotoThumb({ media, onOpen }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMediaSignedUrl(media.storage_path).then((u) => { if (!cancelled) setUrl(u); }).catch(() => setUrl(null));
    return () => { cancelled = true; };
  }, [media.storage_path]);

  return (
    <button onClick={onOpen} className="aspect-square overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      {url ? <img src={url} alt={media.title || ''} className="h-full w-full object-cover" /> : (
        <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-xs text-neutral-400 dark:bg-neutral-800">…</div>
      )}
    </button>
  );
}
