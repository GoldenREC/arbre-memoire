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
import { extractJson, collectImagePaths, matchImages } from '../../lib/customImport/pastedAct.js';

/** Individus déjà présents dans l'arbre, pour le rapprochement de doublons (étape de revue). */
async function fetchExistingForDedupe(treeId) {
  const { data, error } = await supabase
    .from('individuals')
    .select('id, first_names, last_name, birth_name, sex, birth_date, birth_date_precision, death_date, death_date_precision, is_deceased, occupation, biography')
    .eq('tree_id', treeId);
  if (error) throw error;
  // Tous les champs comparables : la revue affiche les vraies différences
  // entre la fiche existante et le fichier (voir MergeReview.jsx).
  return (data || []).map((r) => ({
    id: r.id, firstNames: r.first_names, lastName: r.last_name, birthName: r.birth_name, sex: r.sex,
    birthDate: r.birth_date, birthDatePrecision: r.birth_date_precision,
    deathDate: r.death_date, deathDatePrecision: r.death_date_precision,
    isDeceased: r.is_deceased, occupation: r.occupation, biography: r.biography,
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
  const [existingIndividuals, setExistingIndividuals] = useState([]);
  const [pastedJson, setPastedJson] = useState('');
  const [scanFiles, setScanFiles] = useState([]);
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
    setExistingIndividuals(existingMapped);
    setImportBatchId(batchId);
    setStep('review');
  }

  async function handleCustomFile(file) {
    const { model: rawModel, imagesByPath: images } = await parseCustomImportFile(file);
    await reviewCustomModel(rawModel, images, file.name);
  }

  // Acte collé en texte (JSON produit par une IA — voir docs/PROMPT_ACTE.md)
  // + scans choisis à la main : même suite que pour un .zip.
  async function handlePastedAct() {
    setStep('parsing');
    setErrorMsg(null);
    try {
      const rawModel = extractJson(pastedJson);
      const { imagesByPath: images, missing } = matchImages([...collectImagePaths(rawModel)], scanFiles);
      if (missing.length) {
        throw new Error(
          `Le JSON cite ${missing.length > 1 ? 'des images' : 'une image'} (${missing.join(', ')}) : ajoute le scan de l'acte dans le champ prévu avant d'analyser.`
        );
      }
      setFileName('acte collé');
      await reviewCustomModel(rawModel, images, 'acte-colle.json');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Impossible de lire cet acte.');
      setStep('error');
    }
  }

  async function reviewCustomModel(rawModel, images, name) {
    const errors = validateCustomImport(rawModel, { availableImagePaths: new Set(images.keys()) });
    if (errors.length) {
      throw new Error(errors.join('\n'));
    }
    const model = mapCustomImportToStagingModel(rawModel);

    const existingMapped = await fetchExistingForDedupe(currentTreeId);
    const found = findDuplicateCandidates(existingMapped, model.individuals, 0.72);
    const batchId = await createImportBatch(currentTreeId, name, model.stats);

    // Pas de saveStagingModel ici : la zone de staging IndexedDB (prévue
    // pour les gros fichiers GEDCOM) ne sait pas porter `proofs` ni les
    // File des images — le modèle complet reste en mémoire React, ce qui
    // suffit pour la taille d'un import personnalisé (quelques actes).
    setStagingModel(model);
    setImagesByPath(images);
    setCandidates(found);
    setExistingIndividuals(existingMapped);
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
        existingIndividuals={existingIndividuals}
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

      <div className="mt-8 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">Importer un acte transcrit par une IA</h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Donne la photo de l'acte et le prompt de <code>docs/PROMPT_ACTE.md</code> à une IA, puis colle ici le JSON qu'elle renvoie et
          joins le scan. Tu choisiras ensuite, personne par personne, la fiche existante à relier ou la fiche à créer.
        </p>
        <textarea
          className="field mt-3 min-h-[9rem] font-mono text-xs"
          placeholder='{ "formatVersion": "1.0", "individuals": [ … ], "unions": [ … ] }'
          aria-label="JSON de l'acte"
          value={pastedJson}
          onChange={(e) => setPastedJson(e.target.value)}
        />
        <label className="mt-3 block text-xs text-neutral-500 dark:text-neutral-400">
          Scan de l'acte (une ou plusieurs images, ou un PDF)
          <input
            type="file"
            accept="image/*,.pdf"
            multiple
            className="field mt-1"
            onChange={(e) => setScanFiles(Array.from(e.target.files || []))}
          />
        </label>
        <button
          onClick={handlePastedAct}
          disabled={step === 'parsing' || !pastedJson.trim()}
          className="mt-3 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
        >
          {step === 'parsing' ? 'Analyse en cours…' : "Analyser l'acte"}
        </button>
      </div>

      {step === 'error' && <p className="mt-4 whitespace-pre-line text-sm text-red-600">{errorMsg}</p>}
    </div>
  );
}
