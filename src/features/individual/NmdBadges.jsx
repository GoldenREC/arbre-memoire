import { useMemo, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { computeNmdStatus } from './nmdStatus.js';
import EventActsModal from './EventActsModal.jsx';

const LETTERS = {
  birth: { letter: 'N', title: 'Acte de naissance' },
  marriage: { letter: 'M', title: 'Acte de mariage' },
  death: { letter: 'D', title: 'Acte de décès' },
};

/**
 * Les trois pastilles N / M / D de l'en-tête de fiche : vertes dès
 * qu'un acte est effectivement rattaché (et porte un média scanné) à
 * l'événement correspondant, neutres sinon. Un clic ouvre la gestion
 * des actes pour cet événement (EventActsModal) — pour le mariage,
 * s'il y a plusieurs unions, un petit sélecteur demande d'abord
 * laquelle.
 */
export default function NmdBadges({ individual, unions, events, citations, canEdit, treeId, onChanged }) {
  const status = useMemo(() => computeNmdStatus({ individual, unions, events, citations }), [individual, unions, events, citations]);
  const [open, setOpen] = useState(null); // null | 'birth' | 'death' | 'marriage' | 'marriage-choose'
  const [unionChoice, setUnionChoice] = useState(null);

  function handleOpen(kind) {
    if (kind === 'marriage') {
      if (status.marriage.options.length === 0) return;
      if (status.marriage.options.length === 1) {
        setUnionChoice(status.marriage.options[0]);
        setOpen('marriage');
        return;
      }
      setOpen('marriage-choose');
      return;
    }
    setOpen(kind);
  }

  function close() {
    setOpen(null);
    setUnionChoice(null);
  }

  const personName = `${individual.firstNames || ''} ${individual.lastName || ''}`.trim();

  return (
    <>
      <div className="flex items-center gap-1">
        <Pastille {...LETTERS.birth} active={status.birth.hasAct} onClick={() => handleOpen('birth')} />
        {status.applicable.marriage && (
          <Pastille {...LETTERS.marriage} active={status.marriage.hasAct} onClick={() => handleOpen('marriage')} />
        )}
        {status.applicable.death && (
          <Pastille {...LETTERS.death} active={status.death.hasAct} onClick={() => handleOpen('death')} />
        )}
      </div>

      {open === 'marriage-choose' && (
        <Modal title="Quelle union ?" onClose={close}>
          <ul className="space-y-1.5">
            {status.marriage.options.map((opt) => (
              <li key={opt.unionId}>
                <button
                  onClick={() => { setUnionChoice(opt); setOpen('marriage'); }}
                  className="flex w-full items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                >
                  <span>⚭ {opt.partnerName || 'Conjoint(e) inconnu(e)'}</span>
                  {opt.hasAct && <span className="text-xs text-emerald-600">Acte ✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {open === 'birth' && (
        <EventActsModal
          title="Acte de naissance"
          treeId={treeId}
          individualId={individual.id}
          subjectKind="individual"
          subjectId={individual.id}
          eventType="birth"
          eventId={status.birth.eventId}
          proofLevel={status.birth.proofLevel}
          fallbackSnapshot={{ date: individual.birthDate, datePrecision: individual.birthDatePrecision, placeId: individual.birthPlaceId }}
          defaultTitle={`Acte de naissance — ${personName}`}
          canEdit={canEdit}
          onClose={close}
          onChanged={onChanged}
        />
      )}

      {open === 'death' && (
        <EventActsModal
          title="Acte de décès"
          treeId={treeId}
          individualId={individual.id}
          subjectKind="individual"
          subjectId={individual.id}
          eventType="death"
          eventId={status.death.eventId}
          proofLevel={status.death.proofLevel}
          fallbackSnapshot={{ date: individual.deathDate, datePrecision: individual.deathDatePrecision, placeId: individual.deathPlaceId }}
          defaultTitle={`Acte de décès — ${personName}`}
          canEdit={canEdit}
          onClose={close}
          onChanged={onChanged}
        />
      )}

      {open === 'marriage' && unionChoice && (
        <EventActsModal
          title={`Acte de mariage${unionChoice.partnerName ? ` — ${unionChoice.partnerName}` : ''}`}
          treeId={treeId}
          individualId={individual.id}
          subjectKind="union"
          subjectId={unionChoice.unionId}
          eventType="marriage"
          eventId={unionChoice.eventId}
          proofLevel={unionChoice.proofLevel}
          fallbackSnapshot={{ date: unionChoice.startDate, datePrecision: unionChoice.startDatePrecision, placeId: unionChoice.placeId }}
          defaultTitle={`Acte de mariage — ${personName}${unionChoice.partnerName ? ` & ${unionChoice.partnerName}` : ''}`}
          canEdit={canEdit}
          onClose={close}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function Pastille({ letter, title, active, disabled, onClick }) {
  return (
    <button
      type="button"
      title={disabled ? `${title} — aucune union enregistrée` : title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
        disabled
          ? 'cursor-not-allowed bg-neutral-50 text-neutral-300 dark:bg-neutral-900 dark:text-neutral-700'
          : active
          ? 'bg-emerald-500 text-white hover:bg-emerald-600'
          : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700'
      }`}
    >
      {letter}
    </button>
  );
}
