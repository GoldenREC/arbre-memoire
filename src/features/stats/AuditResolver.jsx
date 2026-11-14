import { useState } from 'react';
import { Link } from 'react-router-dom';
import { describeEventVersions, keepEventVersion, versionChoices, bestProofLevel, deleteEvents } from './auditCorrections.js';
import { deleteSource } from '../sources/sourcesMutations.js';
import { PROOF_KIND_LABELS, proofKindOf } from '../sources/sourceFilters.js';
import { PROOF_LEVEL_LABELS, proofLevelBadgeClass } from '../../lib/utils/proofLevel.js';
import { formatGenealogyDate } from '../../lib/utils/dates.js';
import { pushToast, pushErrorToast } from '../../store/useToastStore.js';

const diffClass = 'rounded bg-amber-100 px-1 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200';

/** Une source, avec sa suppression en deux clics. */
function SourceLine({ source, canEdit, onDeleted }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    try {
      await deleteSource(source.id);
      pushToast('Source supprimée.');
      onDeleted?.();
    } catch (err) {
      pushErrorToast(err.message || 'La suppression a échoué.');
      setBusy(false);
      setArmed(false);
    }
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs">
      <div className="min-w-0">
        <p className="text-neutral-700 dark:text-neutral-200">
          {source.title}
          <span className="ml-1.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            {PROOF_KIND_LABELS[proofKindOf({ title: source.title, source_type: source.sourceType })]}
          </span>
          {source.hasMedia && <span className="ml-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">scan joint</span>}
        </p>
        <p className="text-neutral-400">{[source.repository, source.callNumber].filter(Boolean).join(' — ') || 'Aucune localisation renseignée'}</p>
        {source.transcription && <p className="mt-0.5 italic text-neutral-500 dark:text-neutral-400">« {source.transcription} »</p>}
      </div>
      {canEdit && (
        <button onClick={handleDelete} disabled={busy} className="flex-none text-red-500 hover:text-red-700 disabled:opacity-60">
          {busy ? 'Suppression…' : armed ? 'Confirmer la suppression' : 'Supprimer cette source'}
        </button>
      )}
    </li>
  );
}

/**
 * Panneau de correction d'un constat de l'Audit :
 *  - événement enregistré plusieurs fois : les versions côte à côte (ce
 *    qui diffère est surligné), un bouton "Garder cette version" ;
 *  - preuves contradictoires : les deux sources, chacune supprimable.
 */
export default function AuditResolver({ finding, bundle, canEdit, onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const [picks, setPicks] = useState({});

  const [staleArmed, setStaleArmed] = useState(false);

  if (finding.kind === 'stale_union_event') {
    const { versions } = describeEventVersions(finding.eventIds, bundle);
    async function handleDeleteStale() {
      if (!staleArmed) {
        setStaleArmed(true);
        return;
      }
      setBusyId('stale');
      try {
        await deleteEvents(finding.eventIds);
        pushToast('Événement supprimé.');
        onChanged?.();
      } catch (err) {
        pushErrorToast(err.message || 'La suppression a échoué.');
        setBusyId(null);
        setStaleArmed(false);
      }
    }
    return (
      <div className="mt-2 space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        {versions.map((v) => (
          <div key={v.event.id} className="text-sm">
            <p>
              {v.date ? formatGenealogyDate({ date: v.date, datePrecision: v.datePrecision }) : 'Date inconnue'}
              {v.placeLabel ? ` · ${v.placeLabel}` : ''}
            </p>
            <p className="text-xs text-neutral-400">
              {v.sources.length ? `Preuves rattachées : ${v.sources.map((s) => s.title).join(' ; ')}` : 'Aucune preuve rattachée.'}
            </p>
          </div>
        ))}
        <p className="text-xs text-neutral-500">
          Si le statut est juste, supprime cet événement. Si c'est le statut qui est faux, corrige-le dans la{' '}
          <Link to="/unions" className="text-accent-600 hover:underline dark:text-accent-400">revue des unions</Link>.
        </p>
        {canEdit && (
          <button onClick={handleDeleteStale} disabled={busyId !== null} className="text-sm text-red-500 hover:text-red-700 disabled:opacity-60">
            {busyId === 'stale' ? 'Suppression…' : staleArmed ? 'Confirmer la suppression de cet événement' : 'Supprimer cet événement'}
          </button>
        )}
      </div>
    );
  }

  if (finding.kind === 'conflicting_sources' || finding.kind === 'duplicate_proofs') {
    const sources = finding.sourceIds
      .map((id) => bundle.sources.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => ({
        ...s,
        hasMedia: bundle.citations.some((c) => c.sourceId === s.id && c.hasMedia),
        transcription: bundle.citations.find((c) => c.sourceId === s.id && c.transcription)?.transcription || null,
      }));
    return (
      <div className="mt-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <p className="mb-2 text-xs text-neutral-500">
          {finding.kind === 'conflicting_sources'
            ? "Supprime la source dont le dépôt est faux. L'autre reste rattachée à l'événement."
            : 'Garde la plus complète et supprime les autres.'}
        </p>
        <ul className="space-y-2">
          {sources.map((s) => <SourceLine key={s.id} source={s} canEdit={canEdit} onDeleted={onChanged} />)}
        </ul>
      </div>
    );
  }

  const { versions, differs } = describeEventVersions(finding.eventIds, bundle);
  const choices = versionChoices(versions);
  // Par version : la date et le lieu qu'elle aura une fois gardée (les
  // siens par défaut, ou ceux d'une autre version choisis dans la liste).
  const picked = (v) => ({
    dateKey: picks[v.event.id]?.dateKey ?? `${v.date || ''}|${v.datePrecision}`,
    placeKey: picks[v.event.id]?.placeKey ?? (v.placeLabel || ''),
  });
  const setPick = (v, patch) => setPicks((p) => ({ ...p, [v.event.id]: { ...picked(v), ...patch } }));

  async function handleKeep(version) {
    setBusyId(version.event.id);
    try {
      const { dateKey, placeKey } = picked(version);
      const date = choices.dates.find((d) => d.key === dateKey);
      const place = choices.places.find((p) => p.key === placeKey);
      await keepEventVersion(version.event, finding.eventIds, {
        overrides: {
          date: date?.date || null,
          datePrecision: date?.datePrecision || 'unknown',
          placeId: place?.placeId || null,
          proofLevel: bestProofLevel(versions),
        },
      });
      pushToast('Version conservée, les autres exemplaires sont supprimés.');
      onChanged?.();
    } catch (err) {
      pushErrorToast(err.message || 'La correction a échoué.');
      setBusyId(null);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-neutral-500">
        Choisis la bonne version : les autres exemplaires sont supprimés, leurs preuves sont rattachées à celle que tu gardes
        {versions[0]?.event.eventType === 'marriage' ? '.' : ' et la fiche est mise à jour avec sa date et son lieu.'}
        {(differs.date || differs.place) && ' Quand la date ou le lieu diffèrent, une liste te laisse choisir lequel garder avant de valider.'}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {versions.map((v) => (
          <div key={v.event.id} className="flex flex-col rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <dl className="space-y-1 text-sm">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-neutral-400">Date</dt>
                <dd>
                  {canEdit && differs.date ? (
                    <select className="field" aria-label="Date à garder" value={picked(v).dateKey} onChange={(e) => setPick(v, { dateKey: e.target.value })}>
                      {choices.dates.map((d) => (
                        <option key={d.key} value={d.key}>{d.date ? formatGenealogyDate({ date: d.date, datePrecision: d.datePrecision }) : 'Inconnue'}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={differs.date ? diffClass : ''}>{v.date ? formatGenealogyDate({ date: v.date, datePrecision: v.datePrecision }) : 'Inconnue'}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-neutral-400">Lieu</dt>
                <dd>
                  {canEdit && differs.place ? (
                    <select className="field" aria-label="Lieu à garder" value={picked(v).placeKey} onChange={(e) => setPick(v, { placeKey: e.target.value })}>
                      {choices.places.map((p) => <option key={p.key} value={p.key}>{p.label || 'Inconnu'}</option>)}
                    </select>
                  ) : (
                    <span className={differs.place ? diffClass : ''}>{v.placeLabel || 'Inconnu'}</span>
                  )}
                </dd>
              </div>
            </dl>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {v.proofLevel && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${proofLevelBadgeClass(v.proofLevel)}`}>{PROOF_LEVEL_LABELS[v.proofLevel]}</span>
              )}
              {v.onRecord && (
                <span className="rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] text-accent-700 dark:bg-accent-900/40 dark:text-accent-200">Affichée sur la fiche</span>
              )}
            </div>
            <div className="mt-2 flex-1">
              <p className="text-[10px] uppercase tracking-wide text-neutral-400">Preuves</p>
              {v.sources.length === 0 ? (
                <p className="text-xs text-neutral-400">Aucune preuve rattachée.</p>
              ) : (
                <ul className="mt-1 space-y-1.5">
                  {v.sources.map((s) => <SourceLine key={s.id} source={s} canEdit={canEdit} onDeleted={onChanged} />)}
                </ul>
              )}
            </div>
            {canEdit && (
              <button
                onClick={() => handleKeep(v)}
                disabled={busyId !== null}
                className="mt-3 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
              >
                {busyId === v.event.id ? 'Enregistrement…' : 'Garder cette version'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
