import { useState } from 'react';
import { formatGenealogyDate } from '../../lib/utils/dates.js';
import EventForm, { EVENT_TYPE_LABELS } from './EventForm.jsx';
import { createEvent, updateEvent, deleteEvent } from './individualMutations.js';
import { PROOF_LEVEL_LABELS, proofLevelBadgeClass } from '../../lib/utils/proofLevel.js';
import { pushToast, pushErrorToast } from '../../store/useToastStore.js';

const TYPES = ['occupation', 'residence'];

export default function ProfessionsResidencesTab({ individual, events, places, treeId, canEdit, onChanged }) {
  const [formState, setFormState] = useState(null);
  const relevant = events.filter((e) => e.origin === 'individual' && TYPES.includes(e.eventType));

  async function handleSave(form) {
    try {
      if (formState.event) await updateEvent(formState.event.id, treeId, form);
      else await createEvent(treeId, 'individual', individual.id, form);
      onChanged?.();
      pushToast('Événement enregistré.');
    } catch (err) {
      pushErrorToast(err.message);
      throw err; // garde la modale ouverte, le brouillon n'est pas perdu
    }
  }
  async function handleDelete(eventId) {
    try {
      await deleteEvent(eventId);
      setFormState(null);
      onChanged?.();
      pushToast('Événement supprimé.');
    } catch (err) {
      pushErrorToast(err.message);
    }
  }

  return (
    <div>
      {canEdit && (
        <button onClick={() => setFormState({ event: null })} className="mb-4 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700">
          + Ajouter
        </button>
      )}

      {relevant.length === 0 ? (
        <p className="text-sm text-neutral-400">Aucune profession ou résidence enregistrée.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {relevant.map((e) => (
            <li key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{e.label || EVENT_TYPE_LABELS[e.eventType]}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${proofLevelBadgeClass(e.proofLevel)}`}>
                    {PROOF_LEVEL_LABELS[e.proofLevel]}
                  </span>
                </div>
                <div className="text-xs text-neutral-400">
                  {formatGenealogyDate({ date: e.date, datePrecision: e.datePrecision })}
                  {e.placeId && places.get(e.placeId) ? ` — ${places.get(e.placeId)}` : ''}
                </div>
              </div>
              {canEdit && (
                <button onClick={() => setFormState({ event: e })} className="text-xs text-neutral-400 hover:text-accent-600">
                  Modifier
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {formState && (
        <EventForm
          initialEvent={formState.event}
          allowedTypes={TYPES}
          places={places}
          onSave={handleSave}
          onDelete={formState.event ? handleDelete : undefined}
          onClose={() => setFormState(null)}
        />
      )}
    </div>
  );
}
