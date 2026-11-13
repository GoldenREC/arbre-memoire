import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatGenealogyDate } from '../../lib/utils/dates.js';
import EventForm, { EVENT_TYPE_LABELS } from './EventForm.jsx';
import { createEvent, updateEvent, deleteEvent } from './individualMutations.js';
import { PROOF_LEVEL_LABELS, proofLevelBadgeClass } from '../../lib/utils/proofLevel.js';

const EVENT_ICONS = {
  birth: '👶', death: '⚰️', marriage: '💍', divorce: '💔', engagement: '💞',
  baptism: '⛲', burial: '🪦', residence: '🏠', immigration: '✈️', emigration: '🛳️',
  occupation: '💼', education: '🎓', military: '🎖️', religion: '⛪', custom: '📌',
};

// Les types gérés directement dans l'en-tête (état civil) ne sont pas
// dupliqués ici : ils sont injectés une seule fois, depuis l'individu
// lui-même, pour éviter d'avoir deux sources de vérité sur une même date.
const HEADER_MANAGED_TYPES = new Set(['birth', 'death']);

function yearOf(date) {
  return date ? date.slice(0, 4) : null;
}

/**
 * Frise chronologique : croise les événements personnels (incluant les
 * mariages/divorces portés par les unions) avec deux jalons familiaux
 * attendus par le cahier des charges — naissance des enfants, décès
 * des parents — affichés dans un style plus discret et cliquables vers
 * la fiche du proche concerné.
 */
export default function Timeline({ individual, events, parents, childGroups, places, treeId, canEdit, onChanged }) {
  const [formState, setFormState] = useState(null); // null | { event: null|existing }

  const items = useMemo(() => {
    const list = [];

    if (individual.birthDate || individual.birthPlaceId) {
      list.push({
        key: 'birth',
        date: individual.birthDate,
        datePrecision: individual.birthDatePrecision,
        eventType: 'birth',
        title: 'Naissance',
        placeLabel: individual.birthPlaceId ? places.get(individual.birthPlaceId) : null,
        kind: 'personal',
      });
    }
    if (individual.isDeceased) {
      list.push({
        key: 'death',
        date: individual.deathDate,
        datePrecision: individual.deathDatePrecision,
        eventType: 'death',
        title: 'Décès',
        placeLabel: individual.deathPlaceId ? places.get(individual.deathPlaceId) : null,
        kind: 'personal',
      });
    }

    for (const e of events) {
      if (e.origin === 'individual' && HEADER_MANAGED_TYPES.has(e.eventType)) continue; // déjà couvert ci-dessus
      list.push({
        key: `event:${e.id}`,
        date: e.date,
        datePrecision: e.datePrecision,
        eventType: e.eventType,
        title: e.label || EVENT_TYPE_LABELS[e.eventType] || e.eventType,
        placeLabel: e.placeId ? places.get(e.placeId) : null,
        description: e.description,
        kind: 'personal',
        editable: e.origin === 'individual',
        raw: e,
      });
    }

    for (const parentLink of parents) {
      const p = parentLink.individual;
      if (p?.isDeceased && p.deathDate) {
        list.push({
          key: `parent-death:${p.id}`,
          date: p.deathDate,
          datePrecision: p.deathDatePrecision,
          eventType: 'death',
          title: `Décès de ${p.firstNames} ${p.lastName}`,
          kind: 'milestone',
          relatedId: p.id,
        });
      }
    }

    for (const group of childGroups) {
      for (const link of group.children) {
        const c = link.individual;
        if (c?.birthDate) {
          list.push({
            key: `child-birth:${c.id}`,
            date: c.birthDate,
            datePrecision: c.birthDatePrecision,
            eventType: 'birth',
            title: `Naissance de ${c.firstNames} ${c.lastName}`,
            kind: 'milestone',
            relatedId: c.id,
          });
        }
      }
    }

    const dated = list.filter((i) => i.date).sort((a, b) => (a.date < b.date ? -1 : 1));
    const undated = list.filter((i) => !i.date);
    return [...dated, ...undated];
  }, [individual, events, parents, childGroups, places]);

  async function handleSaveEvent(form) {
    if (formState.event) {
      await updateEvent(formState.event.id, treeId, form);
    } else {
      await createEvent(treeId, 'individual', individual.id, form);
    }
    onChanged?.();
  }

  async function handleDeleteEvent(eventId) {
    await deleteEvent(eventId);
    setFormState(null);
    onChanged?.();
  }

  return (
    <div>
      {canEdit && (
        <button
          onClick={() => setFormState({ event: null })}
          className="mb-4 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
        >
          + Ajouter un événement
        </button>
      )}

      <ol className="relative space-y-4 border-l border-neutral-200 pl-5 dark:border-neutral-800">
        {items.map((item) => (
          <li key={item.key} className="relative">
            <span
              className={`absolute -left-[26px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                item.kind === 'milestone'
                  ? 'bg-neutral-100 dark:bg-neutral-800'
                  : 'bg-accent-100 dark:bg-accent-900/40'
              }`}
            >
              {EVENT_ICONS[item.eventType] || '•'}
            </span>

            <div className={item.kind === 'milestone' ? 'text-neutral-400' : ''}>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-neutral-500 dark:text-neutral-400">
                  {item.date ? formatGenealogyDate({ date: item.date, datePrecision: item.datePrecision }) : 'Date inconnue'}
                </span>
                <span className={item.kind === 'milestone' ? '' : 'font-medium'}>
                  {item.kind === 'milestone' && item.relatedId ? (
                    <Link to={`/individus/${item.relatedId}`} className="hover:underline">
                      {item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                </span>
                {item.kind === 'milestone' && <span className="text-xs text-neutral-400">(événement familial)</span>}
                {item.raw?.proofLevel && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${proofLevelBadgeClass(item.raw.proofLevel)}`}>
                    {PROOF_LEVEL_LABELS[item.raw.proofLevel]}
                  </span>
                )}
              </div>
              {item.placeLabel && <div className="text-xs text-neutral-400">{item.placeLabel}</div>}
              {item.description && <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{item.description}</div>}
              {canEdit && item.editable && (
                <button
                  onClick={() => setFormState({ event: item.raw })}
                  className="mt-0.5 text-xs text-neutral-400 hover:text-accent-600"
                >
                  Modifier
                </button>
              )}
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-neutral-400">Aucun événement enregistré pour l'instant.</li>}
      </ol>

      {formState && (
        <EventForm
          initialEvent={formState.event}
          allowedTypes={['marriage', 'divorce', 'engagement', 'baptism', 'burial', 'residence', 'immigration', 'emigration', 'occupation', 'education', 'military', 'religion', 'custom']}
          places={places}
          onSave={handleSaveEvent}
          onDelete={formState.event ? handleDeleteEvent : undefined}
          onClose={() => setFormState(null)}
        />
      )}
    </div>
  );
}
