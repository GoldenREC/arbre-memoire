import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.js';
import { listPhotos, listPhotosForIndividual, uploadPhoto } from './mediaMutations.js';
import { getMediaSignedUrl } from '../../lib/db/mediaStorage.js';
import IndividualPicker from '../individual/IndividualPicker.jsx';
import TimeRangeSlider from '../map/TimeRangeSlider.jsx';
import PhotoViewer from './PhotoViewer.jsx';
import { yearOfPhoto, filterPhotosByYearRange } from './photoUtils.js';

/**
 * Galerie photo de l'arbre : grille de toutes les photos (portraits,
 * photos de famille, animaux), avec filtre par personne identifiée et
 * frise temporelle (par date de prise de vue) pour naviguer dans le
 * temps. Cliquer une photo ouvre PhotoViewer (identification de
 * personnes, rattachement à un animal, métadonnées).
 */
export default function PhotosGallery() {
  const { currentTreeId, role } = useAuthStore();
  const canEdit = role === 'admin';
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [personFilter, setPersonFilter] = useState(null); // {id, name} | null
  const [yearRange, setYearRange] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  async function reload() {
    if (!currentTreeId) return;
    setLoading(true);
    const data = personFilter
      ? await listPhotosForIndividual(personFilter.id)
      : await listPhotos(currentTreeId);
    setPhotos(data);
    const years = data.map(yearOfPhoto).filter(Boolean);
    if (years.length) setYearRange((prev) => prev || [Math.min(...years), Math.max(...years)]);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTreeId, personFilter]);

  const yearBounds = useMemo(() => {
    const years = photos.map(yearOfPhoto).filter(Boolean);
    if (!years.length) return null;
    return [Math.min(...years), Math.max(...years)];
  }, [photos]);

  const filtered = useMemo(() => filterPhotosByYearRange(photos, yearRange), [photos, yearRange]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !currentTreeId) return;
    setUploading(true);
    try {
      await uploadPhoto(currentTreeId, file, { title: file.name });
      await reload();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Photos</h1>
        {canEdit && (
          <label className="cursor-pointer rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700">
            {uploading ? 'Envoi…' : '+ Ajouter une photo'}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        )}
      </div>
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        {photos.length} photo{photos.length > 1 ? 's' : ''} dans l'arbre{personFilter ? ` — filtré sur ${personFilter.name}` : ''}.
      </p>

      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="w-64">
          {personFilter ? (
            <button
              onClick={() => setPersonFilter(null)}
              className="flex w-full items-center justify-between rounded-lg border border-accent-200 bg-accent-50 px-3 py-1.5 text-sm text-accent-700 dark:border-accent-800 dark:bg-accent-900/30 dark:text-accent-300"
            >
              {personFilter.name} <span>✕</span>
            </button>
          ) : (
            <IndividualPicker
              treeId={currentTreeId}
              placeholder="Filtrer par personne…"
              onSelect={(r) => setPersonFilter({ id: r.id, name: `${r.first_names || ''} ${r.last_name || ''}`.trim() })}
            />
          )}
        </div>
        {yearRange && yearBounds && <TimeRangeSlider min={yearBounds[0]} max={yearBounds[1]} value={yearRange} onChange={setYearRange} />}
      </div>

      {loading ? (
        <p className="text-sm text-neutral-400">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-neutral-400">Aucune photo pour l'instant.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {filtered.map((media) => (
            <PhotoThumbnail key={media.id} media={media} onOpen={() => setViewing(media)} />
          ))}
        </div>
      )}

      {viewing && (
        <PhotoViewer
          media={viewing}
          treeId={currentTreeId}
          canEdit={canEdit}
          onClose={() => { setViewing(null); reload(); }}
          onChanged={reload}
          onDeleted={() => { setViewing(null); reload(); }}
          onNavigate={(dir) => {
            const idx = filtered.findIndex((m) => m.id === viewing.id);
            const next = filtered[idx + dir];
            if (next) setViewing(next);
          }}
        />
      )}
    </div>
  );
}

function PhotoThumbnail({ media, onOpen }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMediaSignedUrl(media.storage_path).then((u) => { if (!cancelled) setUrl(u); }).catch(() => setUrl(null));
    return () => { cancelled = true; };
  }, [media.storage_path]);

  return (
    <button onClick={onOpen} className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      {url ? (
        <img src={url} alt={media.title || ''} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-xs text-neutral-400 dark:bg-neutral-800">…</div>
      )}
      {media.taken_at && (
        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">{media.taken_at.slice(0, 4)}</span>
      )}
    </button>
  );
}
