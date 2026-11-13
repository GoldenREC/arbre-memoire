import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { addCitation } from './individualMutations.js';
import { PROOF_LEVEL_LABELS, proofLevelBadgeClass } from '../../lib/utils/proofLevel.js';

/**
 * Onglet "Sources & preuves" de la fiche : citations déjà liées
 * (avec l'indice de preuve de l'événement associé, le cas échéant) et
 * rattachement d'une source existante. Le gestionnaire complet — création
 * de sources, visionneuse d'actes, transcription — est accessible depuis
 * le lien "Ouvrir le gestionnaire de sources" ci-dessous.
 */
export default function SourcesTab({ individual, citations, treeId, canEdit, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [sources, setSources] = useState([]);
  const [sourceId, setSourceId] = useState('');
  const [transcription, setTranscription] = useState('');

  useEffect(() => {
    if (!adding) return;
    supabase
      .from('sources')
      .select('id, title')
      .eq('tree_id', treeId)
      .then(({ data }) => setSources(data || []));
  }, [adding, treeId]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!sourceId) return;
    await addCitation(treeId, { individualId: individual.id, sourceId, transcription });
    setAdding(false);
    setTranscription('');
    setSourceId('');
    onChanged?.();
  }

  return (
    <div>
      {citations.length === 0 ? (
        <p className="text-sm text-neutral-400">Aucune source liée à cette fiche pour l'instant.</p>
      ) : (
        <ul className="space-y-2">
          {citations.map((c) => (
            <li key={c.id} className="rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{c.source?.title || 'Source'}</span>
                {c.proofLevel && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${proofLevelBadgeClass(c.proofLevel)}`}>
                    {PROOF_LEVEL_LABELS[c.proofLevel]}
                  </span>
                )}
              </div>
              {c.source?.repository && <div className="text-xs text-neutral-400">{c.source.repository}</div>}
              {c.transcription && <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">« {c.transcription} »</div>}
            </li>
          ))}
        </ul>
      )}

      <Link to="/sources" className="mt-3 inline-block text-xs text-accent-600 hover:underline">
        Ouvrir le gestionnaire de sources →
      </Link>

      {canEdit && (
        <div className="mt-2">
          {!adding ? (
            <button onClick={() => setAdding(true)} className="text-xs text-accent-600 hover:underline">
              + Lier une source existante
            </button>
          ) : sources.length === 0 ? (
            <p className="text-xs text-neutral-400">
              Aucune source n'a encore été créée dans cet arbre — ouvrez le gestionnaire de sources pour en créer une.
            </p>
          ) : (
            <form onSubmit={handleAdd} className="space-y-2">
              <select className="field" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">— Choisir une source —</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              <textarea className="field" rows={2} placeholder="Transcription (optionnel)" value={transcription} onChange={(e) => setTranscription(e.target.value)} />
              <div className="flex gap-2">
                <button type="submit" className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700">
                  Lier
                </button>
                <button type="button" onClick={() => setAdding(false)} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  Annuler
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
