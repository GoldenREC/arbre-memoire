import { useState } from 'react';
import { formatGenealogyDate } from '../../lib/utils/dates.js';
import NmdBadges from './NmdBadges.jsx';
import DatePartsInput from '../../components/ui/DatePartsInput.jsx';
import StructuredPlaceInput, { EMPTY_PLACE } from '../../components/ui/StructuredPlaceInput.jsx';
import DateProofInput, { EMPTY_DATE_PROOF, isDateProofValid } from '../../components/ui/DateProofInput.jsx';
import { isPlaceEmpty } from '../../lib/utils/placeLabel.js';
import { PRECISION_OPTIONS } from '../../lib/utils/datePrecision.js';
import { fetchStructuredPlace } from './individualMutations.js';
import { attachDateProof } from './actsMutations.js';
import { pushToast, pushErrorToast } from '../../store/useToastStore.js';
import { bornMoreThanYearsAgo, effectiveDeceased } from '../../lib/utils/deceasedRule.js';

const SEX_OPTIONS = [
  { value: 'M', label: 'Masculin' },
  { value: 'F', label: 'Féminin' },
  { value: 'U', label: 'Non précisé' },
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
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [saving, setSaving] = useState(false);

  // Une preuve n'est redemandée que si aucune citation n'est déjà
  // rattachée à l'événement de naissance/décès — sinon on la
  // redemanderait à chaque édition d'une fiche déjà sourcée.
  const birthEvent = (events || []).find((e) => e.origin === 'individual' && e.eventType === 'birth') || null;
  const deathEvent = (events || []).find((e) => e.origin === 'individual' && e.eventType === 'death') || null;
  const hasBirthProof = !!birthEvent && (citations || []).some((c) => c.eventId === birthEvent.id);
  const hasDeathProof = !!deathEvent && (citations || []).some((c) => c.eventId === deathEvent.id);
  const birthProofRequired = !!form.birthDate && form.birthDatePrecision === 'exact' && !hasBirthProof;
  // Règle des 130 ans : une naissance trop ancienne impose « décédé ».
  const forcedDeceased = bornMoreThanYearsAgo(form.birthDate);
  const isDeceased = effectiveDeceased(form.isDeceased, form.birthDate);
  const deathProofRequired = isDeceased && !!form.deathDate && form.deathDatePrecision === 'exact' && !hasDeathProof;

  /**
   * Les lieux structurés (les 9 champs) ne sont chargés qu'à l'ouverture
   * de l'édition — places.get() ne porte que raw_label, qui suffit pour
   * l'affichage en lecture mais pas pour pré-remplir StructuredPlaceInput
   * champ par champ.
   */
  async function startEdit() {
    const base = toFormState(individual, places);
    setForm(base);
    setLoadingPlaces(true);
    setEditing(true);
    try {
      const [birthPlace, deathPlace] = await Promise.all([
        fetchStructuredPlace(individual.birthPlaceId),
        fetchStructuredPlace(individual.deathPlaceId),
      ]);
      setForm((f) => ({ ...f, birthPlace: birthPlace || EMPTY_PLACE, deathPlace: deathPlace || EMPTY_PLACE }));
    } catch (err) {
      pushErrorToast(err.message);
    } finally {
      setLoadingPlaces(false);
    }
  }

  async function handleSave() {
    if (birthProofRequired && !isDateProofValid(form.birthProof)) {
      pushErrorToast('Une preuve (acte ou information familiale) est requise pour une date de naissance exacte.');
      return;
    }
    if (deathProofRequired && !isDateProofValid(form.deathProof)) {
      pushErrorToast('Une preuve (acte ou information familiale) est requise pour une date de décès exacte.');
      return;
    }
    setSaving(true);
    try {
      // Un lieu importé d'un GEDCOM ou saisi via l'ancien champ libre n'a
      // qu'un raw_label, pas de champs structurés : StructuredPlaceInput
      // apparaît alors vide bien qu'un lieu soit déjà lié. Si la personne
      // n'y touche pas, on laisse ce lieu inchangé plutôt que d'envoyer un
      // lieu "vide" qui l'effacerait silencieusement — voir le message
      // affiché au-dessus du champ dans ce cas.
      const placesPatch = {};
      if (!(isPlaceEmpty(form.birthPlace) && form.birthPlaceLegacyLabel && !form.birthPlaceTouched)) {
        placesPatch.birth = form.birthPlace;
      }
      if (!(isPlaceEmpty(form.deathPlace) && form.deathPlaceLegacyLabel && !form.deathPlaceTouched)) {
        placesPatch.death = form.deathPlace;
      }

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
          isDeceased,
          occupation: form.occupation,
        },
        placesPatch
      );

      const personName = `${form.firstNames || ''} ${form.lastName || ''}`.trim();
      if (birthProofRequired) {
        await attachDateProof(treeId, {
          subjectId: individual.id,
          individualId: individual.id,
          eventType: 'birth',
          snapshot: { date: form.birthDate, datePrecision: form.birthDatePrecision, placeId: individual.birthPlaceId },
          title: `Acte de naissance — ${personName}`,
          proof: form.birthProof,
        });
      }
      if (deathProofRequired) {
        await attachDateProof(treeId, {
          subjectId: individual.id,
          individualId: individual.id,
          eventType: 'death',
          snapshot: { date: form.deathDate, datePrecision: form.deathDatePrecision, placeId: individual.deathPlaceId },
          title: `Acte de décès — ${personName}`,
          proof: form.deathProof,
        });
      }
      if (birthProofRequired || deathProofRequired) onActsChanged?.();

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
    const birthPlaceLegacy = isPlaceEmpty(form.birthPlace) && form.birthPlaceLegacyLabel && !form.birthPlaceTouched;
    const deathPlaceLegacy = isPlaceEmpty(form.deathPlace) && form.deathPlaceLegacyLabel && !form.deathPlaceTouched;

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
        </div>

        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BlockField label="Date de naissance">
              <DatePartsInput value={form.birthDate} onChange={(v) => setForm((f) => ({ ...f, birthDate: v }))} disabled={loadingPlaces} precision={form.birthDatePrecision} onPrecisionChange={(v) => setForm((f) => ({ ...f, birthDatePrecision: v }))} />
            </BlockField>
            <Field label="Précision (naissance)">
              <select className="field" value={form.birthDatePrecision} onChange={set(setForm, 'birthDatePrecision')}>
                {PRECISION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>
          <BlockField label="Lieu de naissance">
            {birthPlaceLegacy && (
              <p className="mb-1.5 text-[11px] text-neutral-400">
                Lieu actuel (non détaillé) : {form.birthPlaceLegacyLabel} — laissez les champs vides pour le conserver tel quel, ou renseignez-les pour le remplacer par une version détaillée.
              </p>
            )}
            {loadingPlaces ? (
              <p className="text-xs text-neutral-400">Chargement…</p>
            ) : (
              <StructuredPlaceInput value={form.birthPlace} onChange={(v) => setForm((f) => ({ ...f, birthPlace: v, birthPlaceTouched: true }))} />
            )}
          </BlockField>

          {birthProofRequired && (
            <DateProofInput value={form.birthProof} onChange={(v) => setForm((f) => ({ ...f, birthProof: v }))} disabled={loadingPlaces} />
          )}

          <Field label="Décédé(e) ?">
            <input type="checkbox" checked={isDeceased} disabled={forcedDeceased} onChange={(e) => setForm((f) => ({ ...f, isDeceased: e.target.checked }))} />
          </Field>

          {isDeceased && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <BlockField label="Date de décès">
                  <DatePartsInput value={form.deathDate} onChange={(v) => setForm((f) => ({ ...f, deathDate: v }))} disabled={loadingPlaces} precision={form.deathDatePrecision} onPrecisionChange={(v) => setForm((f) => ({ ...f, deathDatePrecision: v }))} />
                </BlockField>
                <Field label="Précision (décès)">
                  <select className="field" value={form.deathDatePrecision} onChange={set(setForm, 'deathDatePrecision')}>
                    {PRECISION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
              </div>
              <BlockField label="Lieu de décès">
                {deathPlaceLegacy && (
                  <p className="mb-1.5 text-[11px] text-neutral-400">
                    Lieu actuel (non détaillé) : {form.deathPlaceLegacyLabel} — laissez les champs vides pour le conserver tel quel, ou renseignez-les pour le remplacer par une version détaillée.
                  </p>
                )}
                {loadingPlaces ? (
                  <p className="text-xs text-neutral-400">Chargement…</p>
                ) : (
                  <StructuredPlaceInput value={form.deathPlace} onChange={(v) => setForm((f) => ({ ...f, deathPlace: v, deathPlaceTouched: true }))} />
                )}
              </BlockField>
              {deathProofRequired && (
                <DateProofInput value={form.deathProof} onChange={(v) => setForm((f) => ({ ...f, deathProof: v }))} disabled={loadingPlaces} />
              )}
            </>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || (birthProofRequired && !isDateProofValid(form.birthProof)) || (deathProofRequired && !isDateProofValid(form.deathProof))}
            className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
          >
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

/**
 * État initial du formulaire. Les lieux structurés (birthPlace/
 * deathPlace) sont posés à EMPTY_PLACE ici — startEdit() les remplace
 * juste après par le résultat de fetchStructuredPlace(), chargé à part
 * car places.get() (déjà en mémoire) ne porte que raw_label. Les
 * *LegacyLabel/*Touched qui les accompagnent servent uniquement à ne
 * pas écraser un lieu existant mais non détaillé si on ne le modifie
 * pas (voir handleSave).
 */
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
    birthPlace: EMPTY_PLACE,
    birthPlaceLegacyLabel: individual.birthPlaceId ? places.get(individual.birthPlaceId) || '' : '',
    birthPlaceTouched: false,
    birthProof: EMPTY_DATE_PROOF,
    isDeceased: !!individual.isDeceased,
    deathDate: individual.deathDate || '',
    deathDatePrecision: individual.deathDatePrecision || 'unknown',
    deathPlace: EMPTY_PLACE,
    deathPlaceLegacyLabel: individual.deathPlaceId ? places.get(individual.deathPlaceId) || '' : '',
    deathPlaceTouched: false,
    deathProof: EMPTY_DATE_PROOF,
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

/** Comme Field, mais en <div> plutôt qu'en <label> : pour un champ composite (plusieurs <select>/<input>, voir DatePartsInput/StructuredPlaceInput) qu'un <label> unique ne peut pas englober correctement. */
function BlockField({ label, children }) {
  return (
    <div>
      <span className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
      {children}
    </div>
  );
}
