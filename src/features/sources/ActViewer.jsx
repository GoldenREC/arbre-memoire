import { useEffect, useRef, useState } from 'react';
import { getMediaSignedUrl, updateMediaInfo } from '../../lib/db/mediaStorage.js';

const FILTERS = [
  { value: 'none', label: 'Normal', css: 'none' },
  { value: 'grayscale', label: 'Niveaux de gris', css: 'grayscale(1) contrast(1.1)' },
  { value: 'invert', label: 'Négatif', css: 'invert(1)' },
  { value: 'invert-gray', label: 'N&B inversé', css: 'grayscale(1) invert(1) contrast(1.1)' },
];

/**
 * Visionneuse d'actes : image en haute définition avec zoom, rotation
 * et déplacement (pan) une fois zoomée, filtres visuels façon
 * visionneuse d'archives départementales (niveaux de gris, négatif —
 * utiles pour lire un acte ancien abîmé ou peu contrasté), navigation
 * entre les pages d'un même acte (plusieurs images rattachées à la
 * même source), et transcription éditable à côté. L'URL signée est à
 * durée limitée (1h), rechargée à chaque page affichée.
 */
export default function ActViewer({ media, mediaList, canEdit, onClose, onChanged }) {
  const pages = mediaList && mediaList.length > 0 ? mediaList : [media];
  const [index, setIndex] = useState(() => Math.max(0, pages.findIndex((m) => m.id === media.id)));
  const current = pages[index] || media;

  const [url, setUrl] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [filter, setFilter] = useState('none');
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [transcription, setTranscription] = useState(current.description || '');
  const [saving, setSaving] = useState(false);
  const dragRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getMediaSignedUrl(current.storage_path).then((signed) => {
      if (!cancelled) setUrl(signed);
    });
    setTranscription(current.description || '');
    setZoom(1);
    setRotation(0);
    setFilter('none');
    setPan({ x: 0, y: 0 });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, current.storage_path]);

  function goTo(i) {
    if (i < 0 || i >= pages.length) return;
    setIndex(i);
  }

  // Raccourcis clavier : Échap pour fermer, ←/→ pour changer de page
  // (sans effet sur un acte à une seule page). Ignorés quand le focus
  // est dans la zone de transcription, pour ne pas gêner la saisie.
  useEffect(() => {
    function handleKeyDown(e) {
      const typing = ['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName);
      if (e.key === 'Escape') { onClose(); return; }
      if (typing) return;
      if (e.key === 'ArrowLeft') goTo(index - 1);
      if (e.key === 'ArrowRight') goTo(index + 1);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, pages.length, onClose]);

  function handleMouseDown(e) {
    if (zoom <= 1) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }
  function handleMouseMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  }
  function handleMouseUp() {
    dragRef.current = null;
  }

  async function handleSaveTranscription() {
    setSaving(true);
    try {
      await updateMediaInfo(current.id, { description: transcription });
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  const filterCss = FILTERS.find((f) => f.value === filter)?.css || 'none';

  return (
    <div className="fixed inset-0 z-50 flex bg-black/80">
      <button onClick={onClose} title="Fermer (Échap)" className="absolute right-4 top-4 z-10 text-2xl text-white/80 hover:text-white">
        ✕
      </button>

      {pages.length > 1 && (
        <>
          <button
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            title="Page précédente (←)"
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-xl text-white hover:bg-black/70 disabled:opacity-30"
          >
            ‹
          </button>
          <button
            onClick={() => goTo(index + 1)}
            disabled={index === pages.length - 1}
            title="Page suivante (→)"
            className="absolute right-20 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-xl text-white hover:bg-black/70 disabled:opacity-30"
          >
            ›
          </button>
          <span className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
            Page {index + 1} / {pages.length}
          </span>
        </>
      )}

      <div
        className="flex flex-1 items-center justify-center overflow-hidden p-6"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {url ? (
          <img
            src={url}
            alt={current.title || 'Acte'}
            className={`max-h-full max-w-full select-none transition-transform ${zoom > 1 ? 'cursor-move' : ''}`}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`, filter: filterCss }}
            draggable={false}
          />
        ) : (
          <p className="text-sm text-white/60">Chargement de l'image…</p>
        )}

        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full bg-black/60 px-3 py-2 text-white">
          <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} className="px-2 hover:text-accent-300">−</button>
          <span className="text-xs">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} className="px-2 hover:text-accent-300">+</button>
          <span className="mx-1 h-4 w-px bg-white/30" />
          <button onClick={() => setRotation((r) => r - 90)} className="px-2 hover:text-accent-300" title="Pivoter à gauche">⟲</button>
          <button onClick={() => setRotation((r) => r + 90)} className="px-2 hover:text-accent-300" title="Pivoter à droite">⟳</button>
          <span className="mx-1 h-4 w-px bg-white/30" />
          <button onClick={() => setPan({ x: 0, y: 0 })} className="px-2 text-xs hover:text-accent-300" title="Recentrer">⊙</button>
          <span className="mx-1 h-4 w-px bg-white/30" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-white outline-none"
          >
            {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>

      <div className="w-80 shrink-0 border-l border-white/10 bg-neutral-950 p-4">
        <h3 className="mb-2 text-sm font-semibold text-white">{current.title || 'Transcription'}</h3>
        <textarea
          className="field min-h-[60vh] bg-neutral-900 text-neutral-100"
          placeholder="Transcrire le texte de l'acte ici…"
          value={transcription}
          onChange={(e) => setTranscription(e.target.value)}
          readOnly={!canEdit}
        />
        {canEdit && (
          <button
            onClick={handleSaveTranscription}
            disabled={saving}
            className="mt-2 w-full rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer la transcription'}
          </button>
        )}
      </div>
    </div>
  );
}
