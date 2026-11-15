import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DatePartsInput from '../../components/ui/DatePartsInput.jsx';
import StructuredPlaceInput, { EMPTY_PLACE } from '../../components/ui/StructuredPlaceInput.jsx';
import { PRECISION_OPTIONS } from '../../lib/utils/datePrecision.js';
import { EVENT_TYPE_LABELS } from '../individual/EventForm.jsx';
import { fetchStructuredPlace } from '../individual/individualMutations.js';
import { saveEventDateAndPlace } from './eventQuickEdit.js';
import { pushToast, pushErrorToast } from '../../store/useToastStore.js';

/**
 * Petit volet posé sur la carte : corrige la date et le lieu d'un
 * événement sans quitter la carte. Rien d'autre (ni nom, ni preuve) :
 * pour le reste, le lien mène à la fiche.
 */
export default function EventQuickEditPanel({ treeId, event, onSaved, onClose }) {
  const [date, setDate] = useState(event.date || '');
  const [datePrecision, setDatePrecision] = useState(event.datePrecision || 'unknown');
  const [place, setPlace] = useState(EMPTY_PLACE);
  const [initialPlace, setInitialPlace] = useState(EMPTY_PLACE);
  const [loadingPlace, setLoadingPlace] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDate(event.date || '');
    setDatePrecision(event.datePrecision || 'unknown');
    setLoadingPlace(true);
    fetchStructuredPlace(event.placeId)
      .then((p) => {
        if (cancelled) return;
        setPlace(p || EMPTY_PLACE);
        setInitialPlace(p || EMPTY_PLACE);
      })
      .catch((err) => pushErrorToast(err))
      .finally(() => !cancelled && setLoadingPlace(false));
    return () => { cancelled = true; };
  }, [event.id, event.placeId, event.date, event.datePrecision]);

  const unstructured = !loadingPlace && Object.values(initialPlace).every((v) => !v);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await saveEventDateAndPlace(treeId, event, { date, datePrecision, place, initialPlace });
      pushToast(result.geocoded ? 'Événement mis à jour, fiche alignée.' : 'Événement mis à jour, mais le nouveau lieu reste à situer (bouton Lieux).');
      await onSaved();
    } catch (err) {
      pushErrorToast(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="absolute right-3 top-3 z-[1100] max-h-[calc(100%-1.5rem)] w-[26rem] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-3 text-sm shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{event.label || EVENT_TYPE_LABELS[event.eventType] || event.eventType}</div>
          <div className="text-xs text-neutral-500">
            {event.people.map((p, i) => (
              <span key={p.id}>{i > 0 && ' & '}<Link to={`/individus/${p.id}`} className="text-accent-600 hover:underline dark:text-accent-400">{p.name}</Link></span>
            ))}
          </div>
        </div>
        <button onClick={onClose} aria-label="Fermer" className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">✕</button>
      </div>

      <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">Date</span>
      <div className="grid grid-cols-1 gap-2">
        <DatePartsInput value={date} onChange={setDate} precision={datePrecision} onPrecisionChange={setDatePrecision} />
        <select className="field" value={datePrecision} onChange={(e) => setDatePrecision(e.target.value)}>
          {PRECISION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <span className="mb-1 mt-3 block text-xs font-medium text-neutral-600 dark:text-neutral-300">Lieu</span>
      {loadingPlace ? (
        <p className="text-xs text-neutral-400">Chargement du lieu…</p>
      ) : (
        <>
          {unstructured && event.placeLabel && (
            <p className="mb-1 text-xs text-neutral-500">Lieu actuel : « {event.placeLabel} » (non détaillé). Remplis les champs pour le préciser, ou laisse vide pour le garder.</p>
          )}
          <StructuredPlaceInput value={place} onChange={setPlace} />
        </>
      )}

      <div className="mt-3 flex gap-2">
        <button onClick={handleSave} disabled={saving || loadingPlace} className="rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button onClick={onClose} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">Annuler</button>
      </div>
    </div>
  );
}
