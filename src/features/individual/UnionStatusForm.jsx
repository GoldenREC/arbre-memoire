import { useEffect, useState } from 'react';
import DatePartsInput from '../../components/ui/DatePartsInput.jsx';
import StructuredPlaceInput, { EMPTY_PLACE } from '../../components/ui/StructuredPlaceInput.jsx';
import { PRECISION_OPTIONS } from '../../lib/utils/datePrecision.js';
import { fetchStructuredPlace } from './individualMutations.js';
import DateProofInput, { EMPTY_DATE_PROOF, isDateProofValid } from '../../components/ui/DateProofInput.jsx';
import {
  saveUnionMilestones, relationshipStatusFromUnion, RELATIONSHIP_STATUS_LABELS,
  milestonesRequiringProof, fetchUnionMilestoneProofs, MILESTONE_LABELS,
} from './unionMutations.js';
import { pushToast, pushErrorToast } from '../../store/useToastStore.js';

const EMPTY_MILESTONE = { date: '', datePrecision: 'unknown', place: EMPTY_PLACE };

function milestoneFromEvent(e) {
  if (!e) return { ...EMPTY_MILESTONE };
  return { date: e.date || '', datePrecision: e.datePrecision || 'unknown', place: EMPTY_PLACE, placeId: e.placeId || null };
}

/**
 * Jalons d'une union : "en couple" / "mariée" / "divorcée", chacun avec
 * sa propre date et son propre lieu (mise en couple / mariage /
 * divorce) — jusqu'à 3 événements distincts pour une même union, au
 * lieu d'une seule date de mariage présumée pour toute union (voir
 * unionMutations.js). `unionEvents` : les events subject_kind='union'
 * de CETTE union (déjà chargés par useIndividualDetail, filtrés par
 * l'appelant) — sert à pré-remplir les jalons mariage/divorce ; la
 * mise en couple se pré-remplit depuis `union` (start_date/placeId)
 * directement, seule source de vérité pour ce jalon-là.
 */
export default function UnionStatusForm({ treeId, union, unionEvents, onSaved, onCancel, initialStatus }) {
  const marriageEvent = (unionEvents || []).find((e) => e.eventType === 'marriage') || null;
  const divorceEvent = (unionEvents || []).find((e) => e.eventType === 'divorce') || null;

  const [relationshipStatus, setRelationshipStatus] = useState(() => initialStatus || relationshipStatusFromUnion(union));
  // Preuves : `existingProofs` = jalons qui en ont déjà une en base ;
  // `proofs` = celles saisies ici pour les jalons qui n'en ont pas encore.
  const [existingProofs, setExistingProofs] = useState({ union_start: false, marriage: false, divorce: false });
  const [proofs, setProofs] = useState({ union_start: EMPTY_DATE_PROOF, marriage: EMPTY_DATE_PROOF, divorce: EMPTY_DATE_PROOF });
  const [start, setStart] = useState({
    date: union?.startDate || '',
    datePrecision: union?.startDatePrecision || 'unknown',
    place: EMPTY_PLACE,
  });
  const [marriage, setMarriage] = useState(() => milestoneFromEvent(marriageEvent));
  const [divorce, setDivorce] = useState(() => milestoneFromEvent(divorceEvent));
  const [loadingPlaces, setLoadingPlaces] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadPlaces() {
      setLoadingPlaces(true);
      try {
        const [startPlace, marriagePlace, divorcePlace, proofState] = await Promise.all([
          fetchStructuredPlace(union?.placeId),
          fetchStructuredPlace(marriageEvent?.placeId),
          fetchStructuredPlace(divorceEvent?.placeId),
          fetchUnionMilestoneProofs(union?.id),
        ]);
        if (cancelled) return;
        setExistingProofs(proofState);
        setStart((s) => ({ ...s, place: startPlace || EMPTY_PLACE }));
        setMarriage((m) => ({ ...m, place: marriagePlace || EMPTY_PLACE }));
        setDivorce((d) => ({ ...d, place: divorcePlace || EMPTY_PLACE }));
      } catch (err) {
        pushErrorToast(err.message);
      } finally {
        if (!cancelled) setLoadingPlaces(false);
      }
    }
    loadPlaces();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [union?.id]);

  // Jalons pour lesquels une preuve reste à fournir avant d'enregistrer.
  const missingProofs = milestonesRequiringProof(relationshipStatus, { start, marriage, divorce }).filter((key) => !existingProofs[key]);
  const proofsValid = missingProofs.every((key) => isDateProofValid(proofs[key]));

  async function handleSave() {
    if (!proofsValid) {
      pushErrorToast('Choisis une preuve pour chaque jalon signalé avant d\'enregistrer.');
      return;
    }
    setSaving(true);
    try {
      await saveUnionMilestones(treeId, union.id, {
        relationshipStatus, start, marriage, divorce,
        proofs: Object.fromEntries(missingProofs.map((key) => [key, proofs[key]])),
      });
      pushToast('Union enregistrée.');
      onSaved?.();
    } catch (err) {
      pushErrorToast(err.message);
    } finally {
      setSaving(false);
    }
  }

  function proofProps(key) {
    return {
      hasProof: existingProofs[key],
      proofRequired: missingProofs.includes(key),
      proof: proofs[key],
      onProofChange: (v) => setProofs((p) => ({ ...p, [key]: v })),
      proofMessage: `${MILESTONE_LABELS[key]} : une preuve est requise.`,
    };
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div>
        <span className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Statut de l'union</span>
        <select className="field max-w-xs" value={relationshipStatus} onChange={(e) => setRelationshipStatus(e.target.value)}>
          {Object.entries(RELATIONSHIP_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Les jalons côte à côte quand la place le permet (fiche, revue des unions). */}
      <div className="grid gap-x-6 gap-y-3 lg:grid-cols-2 2xl:grid-cols-3">
      <Milestone label="Mise en couple" value={start} onChange={setStart} loadingPlaces={loadingPlaces} {...proofProps('union_start')} />

      {(relationshipStatus === 'married' || relationshipStatus === 'divorced') && (
        <Milestone label="Mariage" value={marriage} onChange={setMarriage} loadingPlaces={loadingPlaces} {...proofProps('marriage')} />
      )}

      {relationshipStatus === 'divorced' && (
        <Milestone label="Divorce" value={divorce} onChange={setDivorce} loadingPlaces={loadingPlaces} {...proofProps('divorce')} />
      )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving || loadingPlaces || !proofsValid}
          className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          Annuler
        </button>
      </div>
    </div>
  );
}

function Milestone({ label, value, onChange, loadingPlaces, hasProof, proofRequired, proof, onProofChange, proofMessage }) {
  return (
    <div className="space-y-1.5 rounded-md border border-neutral-100 p-2 dark:border-neutral-800">
      <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">{label}</span>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <DatePartsInput value={value.date} onChange={(v) => onChange((s) => ({ ...s, date: v }))} disabled={loadingPlaces} />
        <select className="field" value={value.datePrecision} onChange={(e) => onChange((s) => ({ ...s, datePrecision: e.target.value }))}>
          {PRECISION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {loadingPlaces ? (
        <p className="text-xs text-neutral-400">Chargement du lieu…</p>
      ) : (
        <StructuredPlaceInput value={value.place} onChange={(v) => onChange((s) => ({ ...s, place: v }))} />
      )}
      {hasProof && <p className="text-xs text-emerald-600 dark:text-emerald-400">✓ Preuve déjà rattachée</p>}
      {!loadingPlaces && proofRequired && (
        <DateProofInput value={proof} onChange={onProofChange} allowMarginal message={proofMessage} />
      )}
    </div>
  );
}
