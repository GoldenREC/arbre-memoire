import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMediaSignedUrl, deleteMedia } from '../../lib/db/mediaStorage.js';
import {
  listFaceTags,
  addFaceTag,
  removeFaceTag,
  listMediaLinks,
  linkMediaToSubject,
  unlinkMediaFromSubject,
  updatePhotoInfo,
} from './mediaMutations.js';
import { listPetsByIds } from '../pets/petsMutations.js';
import IndividualPicker from '../individual/IndividualPicker.jsx';
import PetPicker from '../pets/PetPicker.jsx';
import { useAuthStore } from '../../store/useAuthStore.js';

const MIN_RECT = 0.015; // ignore un rectangle quasi nul (simple clic sans glisser)

const FILTERS = [
  { value: 'none', label: 'Normal', css: 'none' },
  { value: 'grayscale', label: 'Niveaux de gris', css: 'grayscale(1) contrast(1.1)' },
  { value: 'invert', label: 'Négatif', css: 'invert(1)' },
  { value: 'invert-gray', label: 'N&B inversé', css: 'grayscale(1) invert(1) contrast(1.1)' },
];

/**
 * Visionneuse plein écran d'une photo : identification de personnes
 * par zone (glisser un rectangle sur la photo puis choisir la
 * personne), liste des identifications déjà faites, rattachement à un
 * animal, et métadonnées (titre, date, description). Les noms affichés
 * respectent les mêmes règles RGPD que le reste de l'app — une
 * personne vivante protégée apparaît comme "Personne protégée" pour un
 * rôle qui n'a pas le droit de voir son détail.
 */
export default function PhotoViewer({ media, treeId, canEdit, onClose, onChanged, onDeleted, onNavigate }) {
  const { role, privacyThresholdYears } = useAuthStore();
  const [url, setUrl] = useState(null);
  const [tags, setTags] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkedPets, setLinkedPets] = useState([]);
  const [taggingMode, setTaggingMode] = useState(false);
  const [draftRect, setDraftRect] = useState(null);
  const [pendingRect, setPendingRect] = useState(null);
  const [title, setTitle] = useState(media.title || '');
  const [description, setDescription] = useState(media.description || '');
  const [takenAt, setTakenAt] = useState(media.taken_at || '');
  const [savingInfo, setSavingInfo] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [filter, setFilter] = useState('none');
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const imgWrapRef = useRef(null);
  const dragStart = useRef(null);
  const panDrag = useRef(null);

  // En mode identification, la vue reste figée (pas de zoom/rotation/pan) :
  // le calcul des rectangles de tag se fait en fractions de la boîte de
  // l'image telle que rendue, et ne resterait pas correct si l'image
  // affichée était pivotée ou décalée par rapport à son orientation
  // naturelle.
  useEffect(() => {
    if (taggingMode) {
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
    }
  }, [taggingMode]);

  useEffect(() => {
    let cancelled = false;
    getMediaSignedUrl(media.storage_path).then((u) => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [media.storage_path]);

  async function reloadTags() {
    setTags(await listFaceTags(media.id, role, privacyThresholdYears));
  }
  async function reloadLinks() {
    const rows = await listMediaLinks(media.id);
    setLinks(rows);
    const petIds = rows.filter((r) => r.subject_kind === 'pet').map((r) => r.subject_id);
    setLinkedPets(await listPetsByIds(petIds));
  }

  useEffect(() => {
    reloadTags();
    reloadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.id]);

  // Raccourcis clavier : Échap pour fermer, ←/→ pour naviguer entre les
  // photos (quand onNavigate est fourni par l'appelant) — désactivés
  // pendant l'identification de personnes, où les flèches ne doivent
  // pas faire bouger la visionneuse.
  useEffect(() => {
    function handleKeyDown(e) {
      if (taggingMode || pendingRect) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowLeft' && onNavigate) onNavigate(-1);
      if (e.key === 'ArrowRight' && onNavigate) onNavigate(1);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [taggingMode, pendingRect, onClose, onNavigate]);

  function relativePoint(e) {
    const rect = imgWrapRef.current.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1),
    };
  }

  function handleMouseDown(e) {
    if (taggingMode) {
      const p = relativePoint(e);
      dragStart.current = p;
      setDraftRect({ x: p.x, y: p.y, width: 0, height: 0 });
      return;
    }
    if (zoom > 1) {
      panDrag.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    }
  }
  function handleMouseMove(e) {
    if (taggingMode) {
      if (!dragStart.current) return;
      const p = relativePoint(e);
      const sx = dragStart.current.x;
      const sy = dragStart.current.y;
      setDraftRect({ x: Math.min(sx, p.x), y: Math.min(sy, p.y), width: Math.abs(p.x - sx), height: Math.abs(p.y - sy) });
      return;
    }
    if (panDrag.current) {
      setPan({ x: panDrag.current.panX + (e.clientX - panDrag.current.startX), y: panDrag.current.panY + (e.clientY - panDrag.current.startY) });
    }
  }
  function handleMouseUp() {
    if (taggingMode) {
      if (!dragStart.current) return;
      dragStart.current = null;
      setDraftRect((rect) => {
        if (rect && rect.width > MIN_RECT && rect.height > MIN_RECT) setPendingRect(rect);
        return null;
      });
      return;
    }
    panDrag.current = null;
  }

  async function handlePickIndividual(person) {
    if (!pendingRect) return;
    await addFaceTag(media.id, person.id, pendingRect);
    setPendingRect(null);
    await reloadTags();
    onChanged?.();
  }

  async function handleRemoveTag(tagId) {
    await removeFaceTag(tagId);
    await reloadTags();
    onChanged?.();
  }

  async function handleLinkPet(pet) {
    await linkMediaToSubject(media.id, 'pet', pet.id);
    await reloadLinks();
    onChanged?.();
  }
  async function handleUnlinkPet(petId) {
    await unlinkMediaFromSubject(media.id, 'pet', petId);
    await reloadLinks();
    onChanged?.();
  }

  async function handleSaveInfo() {
    setSavingInfo(true);
    try {
      await updatePhotoInfo(media.id, { title, description, takenAt: takenAt || null });
      onChanged?.();
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleDelete() {
    await deleteMedia(media.id, media.storage_path);
    onDeleted?.();
  }

  const taggedIndividualIds = new Set(tags.map((t) => t.individualId));
  const linkedPetIds = new Set(links.filter((l) => l.subject_kind === 'pet').map((l) => l.subject_id));

  return (
    <div className="fixed inset-0 z-50 flex bg-black/80">
      <button onClick={onClose} title="Fermer (Échap)" className="absolute right-4 top-4 z-20 text-2xl text-white/80 hover:text-white">
        ✕
      </button>

      {onNavigate && !taggingMode && (
        <>
          <button onClick={() => onNavigate(-1)} title="Photo précédente (←)" className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-2 text-2xl text-white/80 hover:bg-black/60 hover:text-white">
            ‹
          </button>
          <button onClick={() => onNavigate(1)} title="Photo suivante (→)" className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-2 text-2xl text-white/80 hover:bg-black/60 hover:text-white">
            ›
          </button>
        </>
      )}

      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        {url ? (
          <div
            ref={imgWrapRef}
            className={`relative inline-block select-none ${taggingMode ? 'cursor-crosshair' : zoom > 1 ? 'cursor-move' : ''}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img
              src={url}
              alt={media.title || 'Photo'}
              className="max-h-[85vh] max-w-full transition-transform"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`, filter: FILTERS.find((f) => f.value === filter)?.css || 'none' }}
              draggable={false}
            />

            {/* Les repères de visage sont positionnés en fractions de la boîte
                de l'image non transformée : on ne les affiche que dans la vue
                par défaut (pas de zoom/rotation), sans quoi ils se
                décaleraient visuellement par rapport à l'image pivotée ou
                agrandie. */}
            {zoom === 1 && rotation === 0 && tags.map((t) => (
              <div
                key={t.id}
                style={{ position: 'absolute', left: `${t.x * 100}%`, top: `${t.y * 100}%`, width: `${t.width * 100}%`, height: `${t.height * 100}%` }}
                className="group border-2 border-accent-400"
              >
                <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
                  {t.individual?.masked
                    ? 'Personne protégée'
                    : !taggingMode && t.individual ? (
                        <Link to={`/individus/${t.individual.id}`} className="hover:underline">
                          {t.individual.firstNames} {t.individual.lastName}
                        </Link>
                      ) : (
                        `${t.individual?.firstNames || '?'} ${t.individual?.lastName || ''}`
                      )}
                  {canEdit && (
                    <button onClick={() => handleRemoveTag(t.id)} className="ml-1.5 text-white/70 hover:text-white">✕</button>
                  )}
                </span>
              </div>
            ))}

            {draftRect && (
              <div
                style={{ position: 'absolute', left: `${draftRect.x * 100}%`, top: `${draftRect.y * 100}%`, width: `${draftRect.width * 100}%`, height: `${draftRect.height * 100}%` }}
                className="border-2 border-dashed border-white/90"
              />
            )}

            {pendingRect && (
              <div
                style={{ position: 'absolute', left: `${pendingRect.x * 100}%`, top: `${Math.max(pendingRect.y - 0.09, 0) * 100}%`, width: '220px' }}
                className="z-10"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="rounded-lg bg-white p-2 shadow-xl dark:bg-neutral-900">
                  <IndividualPicker treeId={treeId} onSelect={handlePickIndividual} placeholder="Qui est-ce ?" />
                  <button onClick={() => setPendingRect(null)} className="mt-1 text-xs text-neutral-400 hover:text-neutral-600">
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-white/60">Chargement de l'image…</p>
        )}

        {!taggingMode && (
          <div className="absolute bottom-20 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full bg-black/60 px-3 py-2 text-white">
            <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} className="px-2 hover:text-accent-300">−</button>
            <span className="text-xs">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} className="px-2 hover:text-accent-300">+</button>
            <span className="mx-1 h-4 w-px bg-white/30" />
            <button onClick={() => setRotation((r) => r - 90)} className="px-2 hover:text-accent-300" title="Pivoter à gauche">⟲</button>
            <button onClick={() => setRotation((r) => r + 90)} className="px-2 hover:text-accent-300" title="Pivoter à droite">⟳</button>
            <span className="mx-1 h-4 w-px bg-white/30" />
            <button onClick={() => { setZoom(1); setRotation(0); setPan({ x: 0, y: 0 }); }} className="px-2 text-xs hover:text-accent-300" title="Recentrer">⊙</button>
            <span className="mx-1 h-4 w-px bg-white/30" />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-white outline-none">
              {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        )}

        {canEdit && (
          <button
            onClick={() => { setTaggingMode((v) => !v); setPendingRect(null); }}
            className={`absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium shadow-lg ${
              taggingMode ? 'bg-accent-600 text-white' : 'bg-black/60 text-white hover:bg-black/80'
            }`}
          >
            {taggingMode ? '✓ Terminer l\'identification' : '+ Identifier quelqu\'un'}
          </button>
        )}
      </div>

      <div className="w-80 shrink-0 overflow-y-auto border-l border-white/10 bg-neutral-950 p-4 text-neutral-100">
        <label className="block text-xs text-neutral-400">
          Titre
          <input className="field mt-1 bg-neutral-900 text-neutral-100" value={title} onChange={(e) => setTitle(e.target.value)} readOnly={!canEdit} />
        </label>
        <label className="mt-2 block text-xs text-neutral-400">
          Date de la photo
          <input type="date" className="field mt-1 bg-neutral-900 text-neutral-100" value={takenAt || ''} onChange={(e) => setTakenAt(e.target.value)} readOnly={!canEdit} />
        </label>
        <label className="mt-2 block text-xs text-neutral-400">
          Description
          <textarea className="field mt-1 min-h-[70px] bg-neutral-900 text-neutral-100" value={description} onChange={(e) => setDescription(e.target.value)} readOnly={!canEdit} />
        </label>
        {canEdit && (
          <button onClick={handleSaveInfo} disabled={savingInfo} className="mt-2 w-full rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60">
            {savingInfo ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        )}

        <div className="mt-5 border-t border-white/10 pt-3">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Personnes identifiées {taggedIndividualIds.size > 0 && `(${taggedIndividualIds.size})`}
          </h3>
          {tags.length === 0 ? (
            <p className="text-xs text-neutral-500">Aucune personne identifiée pour l'instant.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {tags.map((t) => (
                <li key={t.id} className="flex items-center justify-between">
                  {t.individual?.masked ? (
                    <span className="text-neutral-400">Personne protégée</span>
                  ) : (
                    <Link to={`/individus/${t.individualId}`} className="hover:underline">
                      {t.individual?.firstNames} {t.individual?.lastName}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 border-t border-white/10 pt-3">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">Animaux associés</h3>
          {linkedPets.length === 0 ? (
            <p className="mb-2 text-xs text-neutral-500">Aucun animal associé.</p>
          ) : (
            <ul className="mb-2 space-y-1 text-sm">
              {linkedPets.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>🐾 {p.name}</span>
                  {canEdit && (
                    <button onClick={() => handleUnlinkPet(p.id)} className="text-xs text-red-400 hover:text-red-300">✕</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <PetPicker
              treeId={treeId}
              excludeIds={[...linkedPetIds]}
              placeholder="Associer un animal…"
              onSelect={handleLinkPet}
            />
          )}
        </div>

        {canEdit && (
          <button onClick={handleDelete} className="mt-6 text-xs text-red-400 hover:text-red-300">
            Supprimer cette photo
          </button>
        )}
      </div>
    </div>
  );
}
