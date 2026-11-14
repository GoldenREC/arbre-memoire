import { useMemo, useState } from 'react';
import { mergeIndividuals, applyConflictResolutions } from '../../lib/dedupe/merge.js';
import { commitImport } from '../../lib/db/commitImport.js';
import { clearStagingArea } from '../../lib/db/localDb.js';
import { supabase } from '../../lib/supabaseClient.js';
import { attachImportProofs } from './attachImportProofs.js';
import { attachImportEvents } from './attachImportEvents.js';
import { describeIncomingRoles } from './incomingRoles.js';
import IndividualPicker from '../individual/IndividualPicker.jsx';
import { formatGenealogyDate } from '../../lib/utils/dates.js';

const FIELD_LABELS = {
  firstNames: 'Prénoms', lastName: 'Nom', birthName: 'Nom de naissance', sex: 'Sexe',
  birthDate: 'Date de naissance', deathDate: 'Date de décès', occupation: 'Profession',
  biography: 'Biographie', isDeceased: 'Décédé(e)',
  birthDatePrecision: 'Précision de la naissance', deathDatePrecision: 'Précision du décès',
};
// Les lieux sont des identifiants internes : pas de choix à l'écran, la
// fiche existante garde le sien s'il est déjà renseigné (voir commitImport.js).
const HIDDEN_CONFLICTS = new Set(['birthPlaceLocalId', 'deathPlaceLocalId']);

function nameOf(p) {
  return `${p?.firstNames || ''} ${p?.lastName || ''}`.trim() || 'Sans nom';
}
function lifeOf(p) {
  const birth = p?.birthDate ? `né(e) ${formatGenealogyDate({ date: p.birthDate, datePrecision: p.birthDatePrecision || 'exact' })}` : null;
  const death = p?.deathDate ? `décédé(e) ${formatGenealogyDate({ date: p.deathDate, datePrecision: p.deathDatePrecision || 'exact' })}` : null;
  return [birth, death].filter(Boolean).join(' · ');
}

/**
 * Étape 2 du pipeline d'import : pour CHAQUE personne du fichier,
 * l'utilisateur choisit de créer une nouvelle fiche ou de la relier à
 * une fiche existante — celle que le site propose quand il en trouve une
 * ressemblante, ou n'importe quelle autre choisie à la main (cas d'un nom
 * orthographié autrement sur l'acte). Les liens du fichier (parents,
 * enfants, conjoints) s'appliquent ensuite aux fiches choisies. Une fiche
 * existante est complétée, jamais vidée ; les champs en conflit sont à
 * trancher ici. Rien n'est écrit en base avant "Valider l'import".
 */
export default function MergeReview({ treeId, importBatchId, stagingModel, candidates, existingIndividuals = [], imagesByPath, onDone }) {
  const existingById = useMemo(() => new Map(existingIndividuals.map((e) => [e.id, e])), [existingIndividuals]);

  // Meilleure fiche ressemblante par personne entrante.
  const bestByIncoming = useMemo(() => {
    const map = new Map();
    for (const c of candidates) {
      const prev = map.get(c.incoming.localId);
      if (!prev || c.score > prev.score) map.set(c.incoming.localId, c);
    }
    return map;
  }, [candidates]);

  const roles = useMemo(() => describeIncomingRoles(stagingModel), [stagingModel]);

  // { [localId]: id de la fiche existante choisie, ou null pour "nouvelle fiche" }
  const [links, setLinks] = useState(() => {
    const initial = {};
    for (const ind of stagingModel.individuals) {
      const c = bestByIncoming.get(ind.localId);
      initial[ind.localId] = c && c.score >= 0.85 ? c.existing.id : null;
    }
    return initial;
  });
  const [resolutions, setResolutions] = useState({}); // { [localId]: { [field]: 'existing'|'incoming' } }
  const [pickingFor, setPickingFor] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [summary, setSummary] = useState(null);

  const linkedCount = Object.values(links).filter(Boolean).length;
  const newCount = stagingModel.individuals.length - linkedCount;
  // Deux personnes du fichier reliées à la même fiche : presque toujours une erreur de choix.
  const duplicatedTargets = useMemo(() => {
    const counts = new Map();
    for (const id of Object.values(links)) if (id) counts.set(id, (counts.get(id) || 0) + 1);
    return new Set([...counts].filter(([, n]) => n > 1).map(([id]) => id));
  }, [links]);

  function setLink(localId, existingId) {
    setLinks((l) => ({ ...l, [localId]: existingId }));
    setPickingFor(null);
  }
  function setResolution(localId, field, value) {
    setResolutions((r) => ({ ...r, [localId]: { ...r[localId], [field]: value } }));
  }

  async function handleValidate() {
    setCommitting(true);
    setErrorMsg(null);
    try {
      const finalIndividuals = stagingModel.individuals.map((incoming) => {
        const existing = existingById.get(links[incoming.localId]);
        if (!existing) return { ...incoming, existingId: null };
        const chosen = resolutions[incoming.localId] || {};
        const mergeResult = mergeIndividuals(existing, incoming);
        const resolved = applyConflictResolutions(mergeResult, chosen);
        return {
          ...incoming,
          ...resolved,
          existingId: existing.id,
          localId: incoming.localId,
          overrideFields: Object.entries(chosen).filter(([, v]) => v === 'incoming').map(([field]) => field),
        };
      });

      const result = await commitImport({
        treeId,
        importBatchId,
        places: stagingModel.places,
        sources: stagingModel.sources,
        individuals: finalIndividuals,
        families: stagingModel.families,
        filiations: stagingModel.filiations,
      });

      await supabase.from('import_batches').update({ status: 'completed' }).eq('id', importBatchId);
      await clearStagingArea();

      // Import personnalisé : preuves et événements libres, une fois les
      // vrais identifiants connus (une fiche reliée garde son localId).
      const images = imagesByPath || new Map();
      const hasExtras = stagingModel.proofs?.length || stagingModel.events?.length;
      if (!hasExtras) {
        onDone();
        return;
      }
      const proofs = await attachImportProofs(treeId, stagingModel.proofs || [], result, images);
      const events = await attachImportEvents(treeId, stagingModel.events || [], result, images);
      setSummary({
        linked: linkedCount,
        created: newCount,
        proofs: proofs.attached + events.attached,
        events: events.created,
        failed: [...proofs.failed, ...events.failed],
      });
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "L'import a échoué pendant l'écriture en base.");
    } finally {
      setCommitting(false);
    }
  }

  if (summary) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-1 text-xl font-semibold">Import terminé</h1>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          {summary.created} fiche{summary.created > 1 ? 's' : ''} créée{summary.created > 1 ? 's' : ''}, {summary.linked} fiche
          {summary.linked > 1 ? 's' : ''} existante{summary.linked > 1 ? 's' : ''} complétée{summary.linked > 1 ? 's' : ''},{' '}
          {summary.proofs} preuve{summary.proofs > 1 ? 's' : ''} rattachée{summary.proofs > 1 ? 's' : ''}
          {summary.events ? `, ${summary.events} événement${summary.events > 1 ? 's' : ''} ajouté${summary.events > 1 ? 's' : ''}` : ''}.
        </p>
        {summary.failed.length > 0 && (
          <div className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            <p className="mb-2 font-medium">
              {summary.failed.length} élément{summary.failed.length > 1 ? 's' : ''} n'{summary.failed.length > 1 ? 'ont' : 'a'} pas pu être rattaché
              {summary.failed.length > 1 ? 's' : ''} — les fiches sont bien enregistrées, il faudra le faire à la main depuis la fiche concernée :
            </p>
            <ul className="list-inside list-disc space-y-1">
              {summary.failed.map((f, i) => (
                <li key={i}>{f.title} — {f.error}</li>
              ))}
            </ul>
          </div>
        )}
        <button onClick={onDone} className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700">
          Continuer
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">Revue avant import</h1>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        {stagingModel.individuals.length} personne{stagingModel.individuals.length > 1 ? 's' : ''} dans le fichier : {linkedCount} reliée
        {linkedCount > 1 ? 's' : ''} à une fiche existante, {newCount} à créer. Pour chacune, vérifie le choix : les liens de parenté et
        d'union du fichier s'appliqueront aux fiches que tu choisis ici.
      </p>

      {stagingModel.act?.notes && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          Remarques de lecture : {stagingModel.act.notes}
        </p>
      )}

      <div className="mb-6 space-y-3">
        {stagingModel.individuals.map((incoming) => {
          const localId = incoming.localId;
          const suggestion = bestByIncoming.get(localId) || null;
          const linked = existingById.get(links[localId]) || null;
          return (
            <PersonCard
              key={localId}
              incoming={incoming}
              role={roles.get(localId)}
              suggestion={suggestion}
              linked={linked}
              duplicated={linked ? duplicatedTargets.has(linked.id) : false}
              picking={pickingFor === localId}
              treeId={treeId}
              onCreate={() => setLink(localId, null)}
              onLink={(id) => setLink(localId, id)}
              onPick={() => setPickingFor(pickingFor === localId ? null : localId)}
              canPick={(id) => existingById.has(id)}
              resolution={resolutions[localId] || {}}
              onResolutionChange={(field, v) => setResolution(localId, field, v)}
            />
          );
        })}
      </div>

      {duplicatedTargets.size > 0 && (
        <p className="mb-4 text-sm text-amber-600 dark:text-amber-400">
          Plusieurs personnes du fichier sont reliées à la même fiche existante : vérifie ces choix avant de valider.
        </p>
      )}
      {errorMsg && <p className="mb-4 text-sm text-red-600">{errorMsg}</p>}

      <button
        onClick={handleValidate}
        disabled={committing}
        className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
      >
        {committing ? 'Écriture en cours…' : "Valider l'import"}
      </button>
    </div>
  );
}

function PersonCard({ incoming, role, suggestion, linked, duplicated, picking, treeId, onCreate, onLink, onPick, canPick, resolution, onResolutionChange }) {
  const mergeResult = useMemo(() => (linked ? mergeIndividuals(linked, incoming) : null), [linked, incoming]);
  const conflicts = (mergeResult?.conflicts || []).filter((c) => !HIDDEN_CONFLICTS.has(c.field));
  const chip = (active) =>
    `rounded-full px-3 py-1 text-xs ${active ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300'}`;
  const suggestionIsLinked = suggestion && linked && suggestion.existing.id === linked.id;

  return (
    <div className={`rounded-xl border p-4 ${duplicated ? 'border-amber-400' : 'border-neutral-200 dark:border-neutral-800'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{nameOf(incoming)}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{[role, lifeOf(incoming)].filter(Boolean).join(' · ') || 'Aucune autre information dans le fichier'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onCreate} aria-pressed={!linked} className={chip(!linked)}>Nouvelle fiche</button>
          {suggestion && (
            <button onClick={() => onLink(suggestion.existing.id)} aria-pressed={!!suggestionIsLinked} className={chip(!!suggestionIsLinked)}>
              Relier à {nameOf(suggestion.existing)} ({Math.round(suggestion.score * 100)} %)
            </button>
          )}
          <button onClick={onPick} aria-expanded={picking} className={chip(!!linked && !suggestionIsLinked)}>
            {linked && !suggestionIsLinked ? `Reliée à ${nameOf(linked)}` : 'Choisir une autre fiche…'}
          </button>
        </div>
      </div>

      {picking && (
        <div className="mt-3">
          <IndividualPicker
            treeId={treeId}
            placeholder="Chercher la fiche existante à relier…"
            onSelect={(r) => { if (canPick(r.id)) onLink(r.id); }}
          />
        </div>
      )}

      {linked && (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Fiche existante : {nameOf(linked)}{lifeOf(linked) ? ` · ${lifeOf(linked)}` : ''}. Elle sera complétée avec les informations du fichier, rien n'y sera effacé.
        </p>
      )}

      {linked && conflicts.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <p className="text-xs text-neutral-400">Informations différentes — choisis la valeur à garder (à gauche la fiche, à droite le fichier) :</p>
          {conflicts.map((conflict) => (
            <div key={conflict.field} className="grid grid-cols-[110px_1fr_1fr] items-center gap-2 text-xs">
              <span className="text-neutral-500">{FIELD_LABELS[conflict.field] || conflict.field}</span>
              <button
                onClick={() => onResolutionChange(conflict.field, 'existing')}
                className={`rounded border px-2 py-1 text-left ${(resolution[conflict.field] ?? 'existing') === 'existing' ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30' : 'border-neutral-200 dark:border-neutral-700'}`}
              >
                {String(conflict.existingValue ?? '—')}
              </button>
              <button
                onClick={() => onResolutionChange(conflict.field, 'incoming')}
                className={`rounded border px-2 py-1 text-left ${resolution[conflict.field] === 'incoming' ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30' : 'border-neutral-200 dark:border-neutral-700'}`}
              >
                {String(conflict.incomingValue ?? '—')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
