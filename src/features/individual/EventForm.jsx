import { useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { PROOF_LEVELS } from '../../lib/utils/proofLevel.js';

export const EVENT_TYPE_LABELS = {
  birth: 'Naissance', death: 'Décès', union_start: 'Mise en couple', marriage: 'Mariage', divorce: 'Divorce',
  engagement: 'Fiançailles', baptism: 'Baptême', burial: 'Inhumation',
  residence: 'Résidence', immigration: 'Immigration', emigration: 'Émigration',
  occupation: 'Profession', education: 'Études', military: 'Service militaire',
  religion: 'Religion', custom: 'Autre',
  adoption: 'Adoption', foster_placement: "Mise en famille d'accueil", recognition: 'Reconnaissance', abandonment: 'Abandon',
};

const PRECISION_OPTIONS = [
  { value: 'exact', label: 'Exacte' },
  { value: 'about', label: 'Vers' },
  { value: 'before', label: 'Avant' },
  { value: 'after', label: 'Après' },
  { value: 'unknown', label: 'Inconnue' },
];

/**
 * Formulaire (en modale) d'ajout/édition d'un événement — utilisé par
 * la Timeline et par l'onglet Professions & résidences.
 */
export default function EventForm({ initialEvent, allowedTypes, places, onSave, onDelete, onClose }) {
  const isEdit = !!initialEvent?.id;
  const [form, setForm] = useState(() => ({
    eventType: initialEvent?.eventType || allowedTypes?.[0] || 'custom',
    label: initialEvent?.label || '',
    date: initialEvent?.date || '',
    datePrecision: initialEvent?.datePrecision || 'exact',
    placeRaw: initialEvent?.placeId ? places.get(initialEvent.placeId) || '' : '',
    description: initialEvent?.description || '',
    proofLevel: initialEvent?.proofLevel || 'hypothesis',
  }));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const typeOptions = allowedTypes || Object.keys(EVENT_TYPE_LABELS);

  return (
    <Modal title={isEdit ? "Modifier l'événement" : 'Ajouter un événement'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-xs text-neutral-500">
          Type
          <select className="field mt-1" value={form.eventType} onChange={(e) => setForm((f) => ({ ...f, eventType: e.target.value }))}>
            {typeOptions.map((t) => (
              <option key={t} value={t}>{EVENT_TYPE_LABELS[t] || t}</option>
            ))}
          </select>
        </label>

        {form.eventType === 'custom' && (
          <label className="block text-xs text-neutral-500">
            Libellé
            <input className="field mt-1" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          </label>
        )}

        {form.eventType === 'occupation' && (
          <label className="block text-xs text-neutral-500">
            Intitulé du poste
            <input className="field mt-1" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="ex: Menuisier" />
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-neutral-500">
            Date
            <input type="date" className="field mt-1" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </label>
          <label className="block text-xs text-neutral-500">
            Précision
            <select className="field mt-1" value={form.datePrecision} onChange={(e) => setForm((f) => ({ ...f, datePrecision: e.target.value }))}>
              {PRECISION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>

        <label className="block text-xs text-neutral-500">
          Lieu
          <input className="field mt-1" value={form.placeRaw} onChange={(e) => setForm((f) => ({ ...f, placeRaw: e.target.value }))} />
        </label>

        <label className="block text-xs text-neutral-500">
          Notes
          <textarea className="field mt-1" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </label>

        <label className="block text-xs text-neutral-500">
          Indice de preuve
          <select className="field mt-1" value={form.proofLevel} onChange={(e) => setForm((f) => ({ ...f, proofLevel: e.target.value }))}>
            {PROOF_LEVELS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>

        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              Annuler
            </button>
          </div>
          {isEdit && onDelete && (
            <button type="button" onClick={() => onDelete(initialEvent.id)} className="text-sm text-red-500 hover:text-red-700">
              Supprimer
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
