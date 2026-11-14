import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseGedcom } from '../../lib/gedcom/parser.js';
import { mapGedcomToStagingModel } from '../../lib/gedcom/mapper.js';
import { parseCustomImportFile } from '../../lib/customImport/parser.js';
import { validateCustomImport } from '../../lib/customImport/validate.js';
import { mapCustomImportToStagingModel } from '../../lib/customImport/mapper.js';
import { findDuplicateCandidates } from '../../lib/dedupe/similarity.js';
import { supabase } from '../../lib/supabaseClient.js';
import { saveStagingModel } from '../../lib/db/localDb.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import MergeReview from './MergeReview.jsx';

/** Individus déjà présents dans l'arbre, pour le rapprochement de doublons (étape de revue). */
async function fetchExistingForDedupe(treeId) {
  const { data, error } = await supabase
    .from('individuals')
    .select('id, first_names, last_name, sex, birth_date')
    .eq('tree_id', treeId);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id, firstNames: r.first_names, lastName: r.last_name, sex: r.sex, birthDate: r.birth_date,
  }));
}

async function createImportBatch(treeId, filename, stats) {
  const { data, error } = await supabase
    .from('import_batches')
    .insert({
      tree_id: treeId,
      filename,
      status: 'reviewing',
      raw_individual_count: stats.individualCount,
      raw_family_count: stats.familyCount,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Étape 1 du pipeline d'import : sélection du fichier (.ged/.gedcom, ou
 * .json/.zip au format personnalisé — voir docs/IMPORT_FORMAT.md), parsing
 * + mapping 100% côté client, puis recherche de doublons potentiels contre
 * les individus déjà présents dans l'arbre. Le résultat passe à
 * MergeReview pour la revue humaine avant écriture en base.
 */
export default function ImportWizard() {
  const { currentTreeId } = useAuthStore();
  const [step, setStep] = useState('select'); // select | parsing | review | error
  const [fileName, setFileName] = useState(null);
  const [stagingModel, setStagingModel] = useState(null);
  const [imagesByPath, setImagesByPath] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [importBatchId, setImportBatchId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const navigate = useNavigate();

  async function handleGedcomFile(file) {
    const text = await file.text();
    const parsed = parseGedcom(text);
    const model = mapGedcomToStagingModel(parsed);
    if (model.individuals.length === 0) {
      throw new Error("Aucun individu (tag INDI) n'a été trouvé dans ce fichier.");
    }

    const existingMapped = await fetchExistingForDedupe(currentTreeId);
    const found = findDuplicateCandidates(existingMapped, model.individuals, 0.72);
    const batchId = await createImportBatch(currentTreeId, file.name, model.stats);

    await saveStagingModel(model);
    setStagingModel(model);
    setImagesByPath(null);
    setCandidates(found);
    setImportBatchId(batchId);
    setStep('review');
  }

  async function handleCustomFile(file) {
    const { model: rawModel, imagesByPath: images } = await parseCustomImportFile(file);
    const errors = validateCustomImport(rawModel, { availableImagePaths: new Set(images.keys()) });
    if (errors.length) {
      throw new Error(errors.join('\n'));
    }
    const model = mapCustomImportToStagingModel(rawModel);

    const existingMapped = await fetchExistingForDedupe(currentTreeId);
    const found = findDuplicateCandidates(existingMapped, model.individuals, 0.72);
    const batchId = await createImportBatch(currentTreeId, file.name, model.stats);

    // Pas de saveStagingModel ici : la zone de staging IndexedDB (prévue
    // pour les gros fichiers GEDCOM) ne sait pas porter `proofs` ni les
    // File des images — le modèle complet reste en mémoire React, ce qui
    // suffit pour la taille d'un import personnalisé (quelques actes).
    setStagingModel(model);
    setImagesByPath(images);
    setCandidates(found);
    setImportBatchId(batchId);
    setStep('review');
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStep('parsing');
    setErrorMsg(null);

    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.json') || lower.endsWith('.zip')) {
        await handleCustomFile(file);
      } else {
        await handleGedcomFile(file);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(
        err.message ||
          "Impossible de lire ce fichier. Vérifie qu'il s'agit bien d'un export GEDCOM, ou d'un import personnalisé valide (docs/IMPORT_FORMAT.md)."
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
        imagesByPath={imagesByPath}
        onDone={() => navigate('/individus')}
      />
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-xl font-semibold">Import</h1>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        Importe un export .ged depuis un autre logiciel de généalogie (GEDCOM 5.5.1 ou 7.0), ou un
        import personnalisé (.json, ou .zip avec les actes scannés — voir docs/IMPORT_FORMAT.md).
        Le fichier est analysé localement dans ton navigateur avant tout envoi en base.
      </p>

      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-300 p-10 text-center hover:border-accent-400 dark:border-neutral-700">
        <span className="text-3xl">📄</span>
        <span className="text-sm font-medium">
          {step === 'parsing' ? 'Analyse en cours…' : 'Choisir un fichier .ged, .json ou .zip'}
        </span>
        {fileName && <span className="text-xs text-neutral-500">{fileName}</span>}
        <input
          type="file"
          accept=".ged,.gedcom,.json,.zip"
          className="hidden"
          onChange={handleFile}
          disabled={step === 'parsing'}
        />
      </label>

      {step === 'error' && <p className="mt-4 whitespace-pre-line text-sm text-red-600">{errorMsg}</p>}
    </div>
  );
}
