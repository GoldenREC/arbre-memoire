import { useRef, useState } from 'react';
import JSZip from 'jszip';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore.js';
import { exportJsonBackup } from '../../lib/export/jsonExporter.js';
import { restoreTreeSnapshot, validateSnapshotShape, summarizeSnapshot } from '../../lib/export/snapshotRestore.js';
import { supabase } from '../../lib/supabaseClient.js';
import { listOrphanedMediaFiles, deleteOrphanedFiles, fetchRecordHistory, deleteTree } from '../../lib/db/adminMaintenance.js';

// Phrase de confirmation volontairement fixe (non traduite) : il s'agit d'une
// action destructive et irréversible, la même phrase doit être tapée quelle
// que soit la langue de l'interface — comme "RESTAURER" plus haut, mais en
// version longue pour une action encore plus définitive (perte de tout
// l'arbre, pas juste remplacement par une sauvegarde).
const DELETE_TREE_CONFIRM_PHRASE = 'je souhaite supprimé mon arbre généalogique';

const OPERATION_LABEL = { insert: 'Création', update: 'Modification', delete: 'Suppression' };
const TABLE_LABEL = { individuals: 'Individu', unions: 'Union', filiations: 'Filiation', events: 'Événement', citations: 'Citation' };

function formatBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Onglet Paramètres → Maintenance (Snapshot, fichiers orphelins, journal d'activité). Réservé aux administrateurs. */
export default function MaintenancePanel() {
  const { t } = useTranslation();
  const { currentTreeId, isOwner, loadTrees } = useAuthStore();
  const navigate = useNavigate();

  // --- Snapshot : sauvegarde ---
  const [backingUp, setBackingUp] = useState(false);
  const [includeMedia, setIncludeMedia] = useState(false);

  async function handleBackup() {
    setBackingUp(true);
    try {
      await exportJsonBackup(currentTreeId, { includeMedia });
    } finally {
      setBackingUp(false);
    }
  }

  // --- Snapshot : restauration ---
  const fileInputRef = useRef(null);
  const [pendingRestore, setPendingRestore] = useState(null); // { backup, summary, mediaBlobsByFilename }
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(null);
  const [restoreError, setRestoreError] = useState(null);
  const [restoreDone, setRestoreDone] = useState(null);

  async function handleFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRestoreError(null);
    setRestoreDone(null);
    try {
      let backup;
      let mediaBlobsByFilename = null;
      if (file.name.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        const dataEntry = zip.file('data.json');
        if (!dataEntry) throw new Error("Ce fichier .zip ne contient pas de data.json — ce n'est pas une sauvegarde Arbre & Mémoire.");
        backup = JSON.parse(await dataEntry.async('string'));
        // Note : zip.folder('media').files renvoie TOUTES les entrées du zip (JSZip ne filtre
        // pas .files par la racine du dossier), donc on filtre nous-mêmes par préfixe de chemin.
        const entries = Object.values(zip.files).filter((f) => !f.dir && f.name.startsWith('media/'));
        if (entries.length) {
          mediaBlobsByFilename = new Map();
          for (const entry of entries) {
            const name = entry.name.split('/').pop();
            mediaBlobsByFilename.set(name, await entry.async('blob'));
          }
        }
      } else {
        backup = JSON.parse(await file.text());
      }
      const errors = validateSnapshotShape(backup);
      if (errors.length) throw new Error(errors.join(' '));
      setPendingRestore({ backup, summary: summarizeSnapshot(backup), mediaBlobsByFilename });
      setRestoreConfirmText('');
    } catch (err) {
      setRestoreError(err.message || 'Fichier illisible.');
    }
  }

  async function handleConfirmRestore() {
    if (!pendingRestore) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      await restoreTreeSnapshot(currentTreeId, pendingRestore.backup, { onProgress: setRestoreProgress });

      if (pendingRestore.mediaBlobsByFilename) {
        setRestoreProgress('Réinjection des fichiers médias…');
        let uploaded = 0;
        for (const m of pendingRestore.backup.media || []) {
          const filename = (m.storagePath || '').split('/').pop();
          const blob = filename && pendingRestore.mediaBlobsByFilename.get(filename);
          if (!blob) continue;
          const { error } = await supabase.storage.from('media').upload(m.storagePath, blob, { upsert: true });
          if (!error) uploaded++;
        }
        setRestoreDone({ ...summarizeSnapshot(pendingRestore.backup), mediaUploaded: uploaded });
      } else {
        setRestoreDone(summarizeSnapshot(pendingRestore.backup));
      }
      setPendingRestore(null);
    } catch (err) {
      setRestoreError(err.message || "La restauration a échoué en cours de route — l'arbre peut être dans un état partiel ; relance une restauration complète dès que possible.");
    } finally {
      setRestoring(false);
      setRestoreProgress(null);
    }
  }

  // --- Fichiers orphelins ---
  const [orphans, setOrphans] = useState(null);
  const [selectedOrphans, setSelectedOrphans] = useState(new Set());
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  async function handleScan() {
    setScanning(true);
    try {
      const found = await listOrphanedMediaFiles(currentTreeId);
      setOrphans(found);
      setSelectedOrphans(new Set(found.map((f) => f.path)));
    } finally {
      setScanning(false);
    }
  }

  async function handleDeleteOrphans() {
    setCleaning(true);
    try {
      await deleteOrphanedFiles([...selectedOrphans]);
      setOrphans((prev) => prev.filter((f) => !selectedOrphans.has(f.path)));
      setSelectedOrphans(new Set());
    } finally {
      setCleaning(false);
    }
  }

  // --- Zone de danger : suppression définitive de l'arbre ---
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingTree, setDeletingTree] = useState(false);
  const [deleteTreeError, setDeleteTreeError] = useState(null);

  async function handleDeleteTree() {
    if (deleteConfirmText.trim() !== DELETE_TREE_CONFIRM_PHRASE) return;
    setDeletingTree(true);
    setDeleteTreeError(null);
    try {
      await deleteTree(currentTreeId);
      await loadTrees(); // repart avec un arbre vide (créé automatiquement, voir useAuthStore)
      navigate('/');
    } catch (err) {
      setDeleteTreeError(err.message || "La suppression a échoué.");
      setDeletingTree(false);
    }
  }

  // --- Journal d'activité ---
  const [history, setHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  async function handleLoadHistory() {
    setLoadingHistory(true);
    try {
      setHistory(await fetchRecordHistory(currentTreeId, { limit: 60 }));
    } finally {
      setLoadingHistory(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Snapshot */}
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-1 text-sm font-semibold">{t('settings.maintenance.snapshotTitle')}</h2>
        <p className="mb-3 text-xs text-neutral-500">{t('settings.maintenance.snapshotHelp')}</p>
        <label className="mb-3 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
          <input type="checkbox" checked={includeMedia} onChange={(e) => setIncludeMedia(e.target.checked)} />
          {t('settings.maintenance.backupWithMedia')}
        </label>
        <button onClick={handleBackup} disabled={backingUp} className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60">
          {backingUp ? '…' : t('settings.maintenance.backupNow')}
        </button>

        <div className="mt-6 border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <h3 className="mb-1 text-sm font-semibold">{t('settings.maintenance.restoreTitle')}</h3>
          <p className="mb-3 text-xs text-red-600">{t('settings.maintenance.restoreWarning')}</p>
          <input ref={fileInputRef} type="file" accept=".json,.zip" onChange={handleFileChosen} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!isOwner}
            title={isOwner ? undefined : 'Réservé au propriétaire'}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {t('settings.maintenance.restoreButton')}
          </button>

          {restoreError && <p className="mt-2 text-sm text-red-600">{restoreError}</p>}

          {pendingRestore && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
              <p className="mb-2 font-medium text-amber-800 dark:text-amber-200">
                {pendingRestore.summary.individuals} individus · {pendingRestore.summary.unions} unions · {pendingRestore.summary.events} événements · {pendingRestore.summary.media} médias
                {pendingRestore.summary.exportedAt && <> — exporté le {new Date(pendingRestore.summary.exportedAt).toLocaleDateString('fr-FR')}</>}
              </p>
              <label className="mb-2 block text-xs text-amber-800 dark:text-amber-200">{t('settings.maintenance.restoreConfirmPrompt')}</label>
              <input
                value={restoreConfirmText}
                onChange={(e) => setRestoreConfirmText(e.target.value)}
                className="mb-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm outline-none dark:border-amber-800 dark:bg-neutral-900"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmRestore}
                  disabled={restoreConfirmText !== 'RESTAURER' || restoring}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {restoring ? restoreProgress || '…' : 'Restaurer définitivement'}
                </button>
                <button onClick={() => setPendingRestore(null)} className="rounded-lg px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}

          {restoreDone && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              Restauration terminée : {restoreDone.individuals} individus, {restoreDone.unions} unions, {restoreDone.media} médias
              {restoreDone.mediaUploaded != null && <> ({restoreDone.mediaUploaded} fichiers réinjectés)</>}.
            </p>
          )}
        </div>
      </section>

      {/* Fichiers orphelins */}
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-1 text-sm font-semibold">{t('settings.maintenance.cleanupTitle')}</h2>
        <p className="mb-3 text-xs text-neutral-500">{t('settings.maintenance.cleanupHelp')}</p>
        <button onClick={handleScan} disabled={scanning} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800">
          {scanning ? '…' : t('settings.maintenance.scan')}
        </button>

        {orphans && (
          orphans.length === 0 ? (
            <p className="mt-3 text-xs text-neutral-400">{t('settings.maintenance.noOrphans')}</p>
          ) : (
            <div className="mt-3">
              <ul className="mb-2 max-h-56 space-y-1 overflow-y-auto">
                {orphans.map((o) => (
                  <li key={o.path} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <input
                      type="checkbox"
                      checked={selectedOrphans.has(o.path)}
                      onChange={(e) =>
                        setSelectedOrphans((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(o.path); else next.delete(o.path);
                          return next;
                        })
                      }
                    />
                    <span className="flex-1 truncate font-mono">{o.path}</span>
                    <span className="text-neutral-400">{formatBytes(o.sizeBytes)}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={handleDeleteOrphans}
                disabled={cleaning || selectedOrphans.size === 0}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cleaning ? '…' : `${t('common.delete')} (${selectedOrphans.size})`}
              </button>
            </div>
          )
        )}
      </section>

      {/* Journal d'activité */}
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-1 text-sm font-semibold">{t('settings.maintenance.auditLogTitle')}</h2>
        <p className="mb-3 text-xs text-neutral-500">{t('settings.maintenance.auditLogHelp')}</p>
        <button onClick={handleLoadHistory} disabled={loadingHistory} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800">
          {loadingHistory ? '…' : t('settings.maintenance.scan')}
        </button>

        {history && (
          <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
            {history.length === 0 && <p className="text-xs text-neutral-400">Aucune activité enregistrée.</p>}
            {history.map((h) => (
              <li key={h.id} className="rounded-lg border border-neutral-100 px-3 py-1.5 text-xs dark:border-neutral-800">
                <span className="font-medium">{OPERATION_LABEL[h.operation] || h.operation}</span>{' '}
                <span className="text-neutral-500">{TABLE_LABEL[h.tableName] || h.tableName}</span>{' '}
                <span className="text-neutral-400">par {h.changedByEmail || 'système'}</span>{' '}
                <span className="text-neutral-400">— {new Date(h.changedAt).toLocaleString('fr-FR')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Zone de danger */}
      {isOwner && (
        <section className="rounded-xl border border-red-200 p-4 dark:border-red-900">
          <h2 className="mb-1 text-sm font-semibold text-red-700 dark:text-red-400">{t('settings.maintenance.dangerZoneTitle')}</h2>
          <p className="mb-3 text-xs text-neutral-500">{t('settings.maintenance.deleteTreeHelp')}</p>

          {!confirmingDelete ? (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            >
              {t('settings.maintenance.deleteTreeButton')}
            </button>
          ) : (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950">
              <p className="mb-2 text-red-800 dark:text-red-200">{t('settings.maintenance.deleteTreeConfirmPrompt')}</p>
              <p className="mb-2 select-all rounded bg-white px-2 py-1 font-mono text-xs text-red-900 dark:bg-neutral-900 dark:text-red-200">
                {DELETE_TREE_CONFIRM_PHRASE}
              </p>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="mb-2 w-full rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm outline-none dark:border-red-800 dark:bg-neutral-900"
                autoFocus
              />
              {deleteTreeError && <p className="mb-2 text-xs text-red-700 dark:text-red-400">{deleteTreeError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteTree}
                  disabled={deleteConfirmText.trim() !== DELETE_TREE_CONFIRM_PHRASE || deletingTree}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deletingTree ? '…' : t('settings.maintenance.deleteTreeConfirmSubmit')}
                </button>
                <button
                  onClick={() => { setConfirmingDelete(false); setDeleteConfirmText(''); setDeleteTreeError(null); }}
                  disabled={deletingTree}
                  className="rounded-lg px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
