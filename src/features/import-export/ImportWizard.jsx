import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseGedcom } from '../../lib/gedcom/parser.js';
import { mapGedcomToStagingModel } from '../../lib/gedcom/mapper.js';
import { findDuplicateCandidates } from '../../lib/dedupe/similarity.js';
import { supabase } from '../../lib/supabaseClient.js';
import { saveStagingModel } from '../../lib/db/localDb.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import MergeReview from './MergeReview.jsx';

/**
 * Étape 1 du pipeline d'import : sélection du fichier .ged, parsing +
 * mapping 100% côté client, puis recherche de doublons potentiels contre
 * les individus déjà présents dans l'arbre. Le résultat passe à
 * MergeReview pour la revue humaine avant écriture en base.
 */
export default function ImportWizard() {
  const { currentTreeId } = useAuthStore();
  const [step, setStep] = useState('select'); // select | parsing | review | error
  const [fileName, setFileName] = useState(null);
  const [stagingModel, setStagingModel] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [importBatchId, setImportBatchId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const navigate = useNavigate();

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStep('parsing');
    setErrorMsg(null);

    try {
      const text = await file.text();
      const parsed = parseGedcom(text);
      const model = mapGedcomToStagingModel(parsed);

      if (model.individuals.length === 0) {
        throw new Error("Aucun individu (tag INDI) n'a été trouvé dans ce fichier.");
      }

      const { data: existingRows, error: fetchErr } = await supabase
        .from('individuals')
        .select('id, first_names, last_name, sex, birth_date')
        .eq('tree_id', currentTreeId);
      if (fetchErr) throw fetchErr;

      const existingMapped = (existingRows || []).map((r) => ({
        id: r.id, firstNames: r.first_names, lastName: r.last_name, sex: r.sex, birthDate: r.birth_date,
      }));

      const found = findDuplicateCandidates(existingMapped, model.individuals, 0.72);

      const { data: batch, error: batchErr } = await supabase
        .from('import_batches')
        .insert({
          tree_id: currentTreeId,
          filename: file.name,
          status: 'reviewing',
          raw_individual_count: model.stats.individualCount,
          raw_family_count: model.stats.familyCount,
        })
        .select('id')
        .single();
      if (batchErr) throw batchErr;

      await saveStagingModel(model);
      setStagingModel(model);
      setCandidates(found);
      setImportBatchId(batch.id);
      setStep('review');
    } catch (err) {
      console.error(err);
      setErrorMsg(
        err.message ||
          "Impossible de lire ce fichier. Vérifie qu'il s'agit bien d'un export GEDCOM valide."
      );
      setStep('error');
    }
  }

  if (step === 'review' && stagingModel) {
    return (
      <MergeReview
        treeId={currentTreeId}
        importBatchId={importBatchId}
        stagingModel={stagingModel}
        candidates={candidates}
        onDone={() => navigate('/individus')}
      />
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-xl font-semibold">Import GEDCOM</h1>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        Importe un export .ged depuis un autre logiciel de généalogie (GEDCOM 5.5.1 ou 7.0).
        Le fichier est analysé localement dans ton navigateur avant tout envoi en base.
      </p>

      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-300 p-10 text-center hover:border-accent-400 dark:border-neutral-700">
        <span className="text-3xl">📄</span>
        <span className="text-sm font-medium">
          {step === 'parsing' ? 'Analyse en cours…' : 'Choisir un fichier .ged'}
        </span>
        {fileName && <span className="text-xs text-neutral-500">{fileName}</span>}
        <input
          type="file"
          accept=".ged,.gedcom"
          className="hidden"
          onChange={handleFile}
          disabled={step === 'parsing'}
        />
      </label>

      {step === 'error' && <p className="mt-4 text-sm text-red-600">{errorMsg}</p>}
    </div>
  );
}
