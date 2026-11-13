import { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.js';
import { exportGedcom } from '../../lib/export/gedcomExporter.js';
import { exportJsonBackup } from '../../lib/export/jsonExporter.js';
import { exportFamilyBooklet } from '../../lib/export/pdfBooklet.js';
import { exportPedigreeChart } from '../../lib/export/pdfPedigree.js';
import IndividualPicker from '../individual/IndividualPicker.jsx';

const SCOPE_LABELS = {
  all: "Tout l'arbre",
  descendants: 'Descendants de…',
  ascendants: 'Ascendants de…',
};

/**
 * Panneau d'export : GEDCOM filtrable, sauvegarde JSON complète
 * (médias inclus en option), et sorties PDF (livret familial ou arbre
 * d'ascendance imprimable). Chaque export tourne côté client et
 * déclenche directement un téléchargement — aucune donnée ne transite
 * par un serveur tiers.
 */
export default function ExportPanel() {
  const { currentTreeId, privacyThresholdYears } = useAuthStore();
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const [gedcomScope, setGedcomScope] = useState('all');
  const [gedcomRoot, setGedcomRoot] = useState(null);
  const [gedcomMaskLiving, setGedcomMaskLiving] = useState(true);

  const [jsonIncludeMedia, setJsonIncludeMedia] = useState(false);

  const [pdfKind, setPdfKind] = useState('booklet'); // booklet | pedigree
  const [pdfRoot, setPdfRoot] = useState(null);
  const [pdfGenerations, setPdfGenerations] = useState(4);
  const [pdfMaskLiving, setPdfMaskLiving] = useState(true);

  async function run(key, fn) {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
      setMessage({ type: 'ok', text: 'Export terminé — le téléchargement a démarré.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || "L'export a échoué." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      {message && (
        <p className={`rounded-lg px-3 py-2 text-sm ${message.type === 'ok' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>
          {message.text}
        </p>
      )}

      {/* GEDCOM */}
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-1 text-sm font-semibold">Export GEDCOM</h2>
        <p className="mb-3 text-xs text-neutral-500">Format standard 5.5.1, compatible avec la plupart des logiciels de généalogie.</p>

        <div className="space-y-2">
          <div className="flex gap-2">
            {Object.entries(SCOPE_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setGedcomScope(key)}
                className={`rounded-lg px-2.5 py-1 text-xs ${gedcomScope === key ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {gedcomScope !== 'all' && (
            <div className="max-w-xs">
              <IndividualPicker treeId={currentTreeId} onSelect={(r) => setGedcomRoot(r)} placeholder="Choisir la personne racine…" />
              {gedcomRoot && <p className="mt-1 text-xs text-neutral-500">Sélection : {gedcomRoot.first_names} {gedcomRoot.last_name}</p>}
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
            <input type="checkbox" checked={gedcomMaskLiving} onChange={(e) => setGedcomMaskLiving(e.target.checked)} />
            Masquer les personnes vivantes (RGPD)
          </label>
        </div>

        <button
          disabled={busy === 'gedcom' || (gedcomScope !== 'all' && !gedcomRoot)}
          onClick={() =>
            run('gedcom', () =>
              exportGedcom(currentTreeId, {
                maskLiving: gedcomMaskLiving,
                scope: gedcomScope === 'all' ? { mode: 'all' } : { mode: gedcomScope, rootId: gedcomRoot?.id },
              })
            )
          }
          className="mt-3 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
        >
          {busy === 'gedcom' ? 'Export en cours…' : 'Télécharger le .ged'}
        </button>
      </section>

      {/* JSON */}
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-1 text-sm font-semibold">Sauvegarde JSON complète</h2>
        <p className="mb-3 text-xs text-neutral-500">Toutes les tables de l'arbre (individus, unions, événements, sources, animaux…), sans masquage — à conserver en lieu sûr.</p>

        <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
          <input type="checkbox" checked={jsonIncludeMedia} onChange={(e) => setJsonIncludeMedia(e.target.checked)} />
          Inclure les fichiers médias (photos, actes) dans un .zip
        </label>

        <button
          disabled={busy === 'json'}
          onClick={() => run('json', () => exportJsonBackup(currentTreeId, { includeMedia: jsonIncludeMedia }))}
          className="mt-3 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
        >
          {busy === 'json' ? 'Export en cours…' : jsonIncludeMedia ? 'Télécharger le .zip' : 'Télécharger le .json'}
        </button>
      </section>

      {/* PDF */}
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-1 text-sm font-semibold">Export PDF</h2>
        <p className="mb-3 text-xs text-neutral-500">Livret familial synthétique, ou arbre d'ascendance imprimable autour d'une personne.</p>

        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setPdfKind('booklet')}
            className={`rounded-lg px-2.5 py-1 text-xs ${pdfKind === 'booklet' ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}
          >
            Livret familial
          </button>
          <button
            onClick={() => setPdfKind('pedigree')}
            className={`rounded-lg px-2.5 py-1 text-xs ${pdfKind === 'pedigree' ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}
          >
            Arbre d'ascendance
          </button>
        </div>

        {pdfKind === 'pedigree' && (
          <div className="mb-3 space-y-2">
            <div className="max-w-xs">
              <IndividualPicker treeId={currentTreeId} onSelect={(r) => setPdfRoot(r)} placeholder="Choisir la personne racine…" />
              {pdfRoot && <p className="mt-1 text-xs text-neutral-500">Sélection : {pdfRoot.first_names} {pdfRoot.last_name}</p>}
            </div>
            <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
              Générations :
              <select className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 dark:border-neutral-700 dark:bg-neutral-900" value={pdfGenerations} onChange={(e) => setPdfGenerations(Number(e.target.value))}>
                {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
          <input type="checkbox" checked={pdfMaskLiving} onChange={(e) => setPdfMaskLiving(e.target.checked)} />
          Masquer les personnes vivantes (RGPD)
        </label>

        <button
          disabled={busy === 'pdf' || (pdfKind === 'pedigree' && !pdfRoot)}
          onClick={() =>
            run('pdf', () =>
              pdfKind === 'booklet'
                ? exportFamilyBooklet(currentTreeId, { maskLiving: pdfMaskLiving })
                : exportPedigreeChart(currentTreeId, pdfRoot?.id, pdfGenerations, { maskLiving: pdfMaskLiving, privacyThresholdYears })
            )
          }
          className="mt-3 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
        >
          {busy === 'pdf' ? 'Génération en cours…' : 'Télécharger le .pdf'}
        </button>
      </section>
    </div>
  );
}
