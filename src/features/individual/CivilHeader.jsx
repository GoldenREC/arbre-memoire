import { useState } from 'react';
import { formatGenealogyDate } from '../../lib/utils/dates.js';
import NmdBadges from './NmdBadges.jsx';
import { pushToast, pushErrorToast } from '../../store/useToastStore.js';

const SEX_OPTIONS = [
  { value: 'M', label: 'Masculin' },
  { value: 'F', label: 'Féminin' },
  { value: 'U', label: 'Non précisé' },
];
const PRECISION_OPTIONS = [
  { value: 'exact', label: 'Exacte' },
  { value: 'about', label: 'Vers' },
  { value: 'before', label: 'Avant' },
  { value: 'after', label: 'Après' },
  { value: 'unknown', label: 'Inconnue' },
];

function initials(individual) {
  const f = individual?.firstNames?.trim()?.[0] || '';
  const l = individual?.lastName?.trim()?.[0] || '';
  return (f + l).toUpperCase() || '?';
}

/**
 * En-tête de la fiche individu : état civil en lecture, bascule vers un
 * formulaire d'édition pour les membres habilités (admin/famille).
 */
export default function CivilHeader({ individual, unions, places, canEdit, onSave, events, citations, treeId, onActsChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => toFormState(individual, places));
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setForm(toFormState(individual, places));
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(
        {
          firstNames: form.firstNames,
          lastName: form.lastName,
          birthName: form.birthName,
          nickname: form.nickname,
          sex: form.sex,
          birthDate: form.birthDate || null,
          birthDatePrecision: form.birthDatePrecision,
          deathDate: form.deathDate || null,
          deathDatePrecision: form.deathDatePrecision,
          isDeceased: form.isDeceased,
          occupation: form.occupation,
        },
        { birth: form.birthPlace, death: form.deathPlace }
      );
      setEditing(false);
      pushToast('Fiche enregistrée.');
    } catch (err) {
      pushErrorToast(err.message);
    } finally {
      setSaving(false);
    }
  }

  const avatarColor =
    individual.sex === 'M'
      ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300'
      : individual.sex === 'F'
      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
      : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300';

  if (editing) {
    return (
      <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Prénoms"><input className="field" value={form.firstNames} onChange={set(setForm, 'firstNames')} /></Field>
          <Field label="Nom"><input className="field" value={form.lastName} onChange={set(setForm, 'lastName')} /></Field>
          <Field label="Nom de naissance"><input className="field" value={form.birthName} onChange={set(setForm, 'birthName')} /></Field>
          <Field label="Surnom"><input className="field" value={form.nickname} onChange={set(setForm, 'nickname')} /></Field>
          <Field label="Sexe">
            <select className="field" value={form.sex} onChange={set(setForm, 'sex')}>
              {SEX_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Profession"><input className="field" value={form.occupation} onChange={set(setForm, 'occupation')} /></Field>

          <Field label="Date de naissance"><input type="date" className="field" value={form.birthDate} onChange={set(setForm, 'birthDate')} /></Field>
          <Field label="Précision">
            <select className="field" value={form.birthDatePrecision} onChange={set(setForm, 'birthDatePrecision')}>
              {PRECISION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Lieu de naissance"><input className="field" value={form.birthPlace} onChange={set(setForm, 'birthPlace')} /></Field>

          <Field label="Décédé(e) ?">
            <input type="checkbox" checked={form.isDeceased} onChange={(e) => setForm((f) => ({ ...f, isDeceased: e.target.checked }))} />
          </Field>
          <Field label="Date de décès"><input type="date" className="field" value={form.deathDate} onChange={set(setForm, 'deathDate')} /></Field>
          <Field label="Lieu de décès"><input className="field" value={form.deathPlace} onChange={set(setForm, 'deathPlace')} /></Field>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={handleSave} disabled={saving} className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold ${avatarColor}`}>
        {initials(individual)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">
            {individual.firstNames} {individual.lastName}
          </h1>
          {individual.birthName && individual.birthName !== individual.lastName && (
            <span className="text-sm text-neutral-400">née {individual.birthName}</span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              individual.isDeceased
                ? 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            }`}
          >
            {individual.isDeceased ? 'Décédé(e)' : 'Vivant(e)'}
          </span>
          {events && citations && (
            <NmdBadges
              individual={individual}
              unions={unions}
              events={events}
              citations={citations}
              canEdit={canEdit}
              treeId={treeId}
              onChanged={onActsChanged}
            />
          )}
        </div>

        <div className="mt-1 space-y-0.5 text-sm text-neutral-500 dark:text-neutral-400">
          <div>
            Né(e) {formatGenealogyDate({ date: individual.birthDate, datePrecision: individual.birthDatePrecision })}
            {individual.birthPlaceId && places.get(individual.birthPlaceId) ? ` à ${places.get(individual.birthPlaceId)}` : ''}
          </div>
          {individual.isDeceased && (
            <div>
              Décédé(e) {formatGenealogyDate({ date: individual.deathDate, datePrecision: individual.deathDatePrecision })}
              {individual.deathPlaceId && places.get(individual.deathPlaceId) ? ` à ${places.get(individual.deathPlaceId)}` : ''}
            </div>
          )}
          {unions.map((u) => (
            <div key={u.id}>
              ⚭ avec {u.partner ? `${u.partner.firstNames} ${u.partner.lastName}` : 'inconnu(e)'}
              {u.startDate ? ` — ${formatGenealogyDate({ date: u.startDate, datePrecision: u.startDatePrecision })}` : ''}
              {u.status === 'divorced' ? ' (divorcé·e·s)' : ''}
            </div>
          ))}
          {individual.occupation && <div>{individual.occupation}</div>}
        </div>
      </div>

      {canEdit && (
        <button onClick={startEdit} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          Modifier
        </button>
      )}
    </div>
  );
}

function toFormState(individual, places) {
  return {
    firstNames: individual.firstNames || '',
    lastName: individual.lastName || '',
    birthName: individual.birthName || '',
    nickname: individual.nickname || '',
    sex: individual.sex || 'U',
    occupation: individual.occupation || '',
    birthDate: individual.birthDate || '',
    birthDatePrecision: individual.birthDatePrecision || 'unknown',
    birthPlace: individual.birthPlaceId ? places.get(individual.birthPlaceId) || '' : '',
    isDeceased: !!individual.isDeceased,
    deathDate: individual.deathDate || '',
    deathDatePrecision: individual.deathDatePrecision || 'unknown',
    deathPlace: individual.deathPlaceId ? places.get(individual.deathPlaceId) || '' : '',
  };
}

function set(setForm, field) {
  return (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };
}

function Field({ label, children }) {
  return (
    <label className="block text-xs text-neutral-500 dark:text-neutral-400">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}
