import { useState } from 'react';
import DatePartsInput from '../../components/ui/DatePartsInput.jsx';
import StructuredPlaceInput, { EMPTY_PLACE } from '../../components/ui/StructuredPlaceInput.jsx';
import DateProofInput, { EMPTY_DATE_PROOF, isDateProofValid } from '../../components/ui/DateProofInput.jsx';
import IndividualPicker from './IndividualPicker.jsx';
import { toProperCase } from '../../lib/utils/properCase.js';
import { PRECISION_OPTIONS } from '../../lib/utils/datePrecision.js';
import { createIndividualFull, addParentLink, linkAsSibling } from './individualMutations.js';
import { attachDateProof } from './actsMutations.js';
import { pushErrorToast, pushToast } from '../../store/useToastStore.js';

const RELATION_LABELS = (sex) => ({
  father: 'Père',
  mother: 'Mère',
  sibling: sex === 'F' ? 'Sœur' : 'Frère',
  child: 'Enfant',
});

/**
 * Relie la fiche nouvellement créée à une personne existante, selon le
 * lien choisi — vu depuis la personne existante ("elle est le/la ___ de
 * la nouvelle fiche") :
 *  - père / mère : la personne existante devient un parent de la
 *    nouvelle fiche ;
 *  - frère/sœur : la nouvelle fiche reprend les mêmes parents que la
 *    personne existante (il n'y a pas de lien "fratrie" direct dans le
 *    schéma, c'est le partage des parents qui le représente) ;
 *  - enfant : la nouvelle fiche devient un parent de la personne
 *    existante.
 */
async function applyRelation(treeId, newIndividualId, relation, existingPersonId) {
  if (relation === 'father' || relation === 'mother') {
    await addParentLink(treeId, newIndividualId, existingPersonId, 'biological');
  } else if (relation === 'sibling') {
    await linkAsSibling(treeId, newIndividualId, existingPersonId);
  } else if (relation === 'child') {
    await addParentLink(treeId, existingPersonId, newIndividualId, 'biological');
  }
}

const EMPTY_FORM = {
  firstNames: '', birthName: '', maritalLastName: '', sex: 'M',
  birthDate: null, birthDatePrecision: 'exact', birthPlace: EMPTY_PLACE, birthProof: EMPTY_DATE_PROOF,
  isDeceased: false, deathDate: null, deathDatePrecision: 'exact', deathPlace: EMPTY_PLACE, deathProof: EMPTY_DATE_PROOF,
};

/**
 * Formulaire complet de création d'une fiche individu (prénoms, nom de
 * naissance et nom marital, sexe, date et lieu de naissance détaillés,
 * vivant/décédé avec date et lieu de décès, et lien optionnel vers une
 * personne existante). Remplace l'ancien mini-formulaire (prénoms/nom/
 * sexe) de IndividualsList — tout le reste restait de toute façon
 * modifiable ensuite depuis la fiche, mais le renseigner dès la création
 * évite un aller-retour quand on importe à la main une famille entière.
 */
export default function IndividualCreateForm({ treeId, onCreated, onCancel }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [linkEnabled, setLinkEnabled] = useState(false);
  const [linkPerson, setLinkPerson] = useState(null);
  const [relation, setRelation] = useState('father');
  const [saving, setSaving] = useState(false);

  function patch(fields) {
    setForm((f) => ({ ...f, ...fields }));
  }

  function normalizeOnBlur(field) {
    return () => {
      if (form[field]) patch({ [field]: toProperCase(form[field]) });
    };
  }

  const birthProofRequired = !!form.birthDate && form.birthDatePrecision === 'exact';
  const deathProofRequired = form.isDeceased && !!form.deathDate && form.deathDatePrecision === 'exact';

  async function handleSubmit(e) {
    e.preventDefault();
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
      const created = await createIndividualFull(treeId, form);
      const personName = `${created.first_names || ''} ${created.last_name || ''}`.trim();
      if (birthProofRequired) {
        await attachDateProof(treeId, {
          subjectId: created.id,
          individualId: created.id,
          eventType: 'birth',
          snapshot: { date: form.birthDate, datePrecision: form.birthDatePrecision, placeId: created.birthPlaceId },
          title: `Acte de naissance — ${personName}`,
          proof: form.birthProof,
        });
      }
      if (deathProofRequired) {
        await attachDateProof(treeId, {
          subjectId: created.id,
          individualId: created.id,
          eventType: 'death',
          snapshot: { date: form.deathDate, datePrecision: form.deathDatePrecision, placeId: created.deathPlaceId },
          title: `Acte de décès — ${personName}`,
          proof: form.deathProof,
        });
      }
      if (linkEnabled && linkPerson) {
        await applyRelation(treeId, created.id, relation, linkPerson.id);
      }
      pushToast('Fiche créée.');
      onCreated(created);
    } catch (err) {
      pushErrorToast(err.message);
      setSaving(false);
    }
  }

  const relationLabels = RELATION_LABELS(form.sex);

  return (
    <form onSubmit={handleSubmit} className="mb-4 space-y-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Prénoms" autoFocus value={form.firstNames} onChange={(v) => patch({ firstNames: v })} onBlur={normalizeOnBlur('firstNames')} />
        <TextField label="Nom de naissance" value={form.birthName} onChange={(v) => patch({ birthName: v })} onBlur={normalizeOnBlur('birthName')} />
      </div>

      <RadioToggle
        label="Sexe"
        name="sex"
        value={form.sex}
        options={[{ value: 'M', label: 'Homme' }, { value: 'F', label: 'Femme' }]}
        onChange={(v) => patch({ sex: v })}
      />

      {form.sex === 'F' && (
        <TextField label="Nom marital" value={form.maritalLastName} onChange={(v) => patch({ maritalLastName: v })} onBlur={normalizeOnBlur('maritalLastName')} />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Date de naissance">
          <DatePartsInput value={form.birthDate} onChange={(v) => patch({ birthDate: v })} precision={form.birthDatePrecision} onPrecisionChange={(v) => patch({ birthDatePrecision: v })} />
        </Field>
        <Field label="Précision (naissance)">
          <select className="field" value={form.birthDatePrecision} onChange={(e) => patch({ birthDatePrecision: e.target.value })}>
            {PRECISION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Lieu de naissance">
        <StructuredPlaceInput value={form.birthPlace} onChange={(v) => patch({ birthPlace: v })} />
      </Field>

      {birthProofRequired && (
        <DateProofInput value={form.birthProof} onChange={(v) => patch({ birthProof: v })} />
      )}

      <RadioToggle
        label="Statut"
        name="deceased"
        value={form.isDeceased ? 'deceased' : 'alive'}
        options={[{ value: 'alive', label: 'Vivant(e)' }, { value: 'deceased', label: 'Décédé(e)' }]}
        onChange={(v) => patch({ isDeceased: v === 'deceased' })}
      />

      {form.isDeceased && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Date de décès">
              <DatePartsInput value={form.deathDate} onChange={(v) => patch({ deathDate: v })} precision={form.deathDatePrecision} onPrecisionChange={(v) => patch({ deathDatePrecision: v })} />
            </Field>
            <Field label="Précision (décès)">
              <select className="field" value={form.deathDatePrecision} onChange={(e) => patch({ deathDatePrecision: e.target.value })}>
                {PRECISION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Lieu de décès">
            <StructuredPlaceInput value={form.deathPlace} onChange={(v) => patch({ deathPlace: v })} />
          </Field>
          {deathProofRequired && (
            <DateProofInput value={form.deathProof} onChange={(v) => patch({ deathProof: v })} />
          )}
        </>
      )}

      <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={linkEnabled} onChange={(e) => { setLinkEnabled(e.target.checked); if (!e.target.checked) setLinkPerson(null); }} />
          Relier cette nouvelle fiche à une personne existante
        </label>

        {linkEnabled && (
          <div className="mt-2 space-y-2">
            {linkPerson ? (
              <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-1.5 text-sm dark:bg-neutral-800">
                <span>
                  {linkPerson.first_names} {linkPerson.last_name} — {relationLabels[relation]} de la nouvelle fiche
                </span>
                <button type="button" onClick={() => setLinkPerson(null)} className="text-xs text-neutral-400 hover:text-red-500">
                  changer
                </button>
              </div>
            ) : (
              <IndividualPicker treeId={treeId} onSelect={setLinkPerson} placeholder="Chercher la personne à relier…" />
            )}
            <label className="block text-xs text-neutral-500 dark:text-neutral-400">
              <span className="mb-1 block">Lien familial (vu depuis la personne existante)</span>
              <select className="field" value={relation} onChange={(e) => setRelation(e.target.value)}>
                {Object.entries(relationLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || (birthProofRequired && !isDateProofValid(form.birthProof)) || (deathProofRequired && !isDateProofValid(form.deathProof))}
          className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
        >
          {saving ? 'Création…' : 'Créer la fiche'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          Annuler
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <span className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
      {children}
    </div>
  );
}

function TextField({ label, value, onChange, onBlur, autoFocus, className = '' }) {
  return (
    <label className={`block text-xs text-neutral-500 dark:text-neutral-400 ${className}`}>
      <span className="mb-1 block">{label}</span>
      <input
        autoFocus={autoFocus}
        className="field"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </label>
  );
}

function RadioToggle({ label, name, value, options, onChange }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs text-neutral-500 dark:text-neutral-400">{label}</legend>
      <div className="flex gap-4">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-1.5 text-sm">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
