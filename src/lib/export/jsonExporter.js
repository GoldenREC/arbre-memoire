import JSZip from 'jszip';
import { fetchTreeSnapshot } from './fetchTreeSnapshot.js';
import { downloadBlob, downloadJson, todayStamp } from './downloadHelpers.js';
import { downloadMediaBlob } from '../db/mediaStorage.js';

/**
 * Construit l'objet de sauvegarde complète (toutes les tables de
 * l'arbre, hors blobs médias) — fonction pure, testable indépendamment
 * du téléchargement ou de l'empaquetage zip.
 */
export function buildJsonBackup(snapshot) {
  return {
    format: 'arbre-et-memoire-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    treeId: snapshot.treeId,
    privacyThresholdYears: snapshot.privacyThresholdYears ?? 100,
    individuals: snapshot.individuals,
    unions: snapshot.unions,
    filiations: snapshot.filiations,
    places: snapshot.places,
    events: snapshot.events,
    sources: snapshot.sources,
    citations: snapshot.citations,
    media: snapshot.media,
    pets: snapshot.pets,
    petLinks: snapshot.petLinks,
    mediaLinks: snapshot.mediaLinks || [],
    mediaFaceTags: snapshot.mediaFaceTags || [],
  };
}

/**
 * Exporte une sauvegarde JSON complète. Si includeMedia est vrai et que
 * l'arbre contient des médias, le résultat est un .zip contenant
 * data.json + les fichiers médias téléchargés depuis le Storage privé ;
 * sinon un simple fichier .json (métadonnées uniquement, storage_path
 * conservé pour référence mais fichiers non inclus).
 */
export async function exportJsonBackup(treeId, { includeMedia = false } = {}) {
  const snapshot = await fetchTreeSnapshot(treeId);
  const backup = buildJsonBackup(snapshot);
  const stamp = todayStamp();

  if (!includeMedia || snapshot.media.length === 0) {
    downloadJson(backup, `arbre-memoire-sauvegarde-${stamp}.json`);
    return { mediaIncluded: 0 };
  }

  const zip = new JSZip();
  zip.file('data.json', JSON.stringify(backup, null, 2));
  const mediaFolder = zip.folder('media');

  let included = 0;
  for (const m of snapshot.media) {
    try {
      const blob = await downloadMediaBlob(m.storage_path);
      const filename = m.storage_path.split('/').pop() || `${m.id}.bin`;
      mediaFolder.file(filename, blob);
      included++;
    } catch (err) {
      console.error(`Média ${m.id} non récupérable pour l'export :`, err);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, `arbre-memoire-sauvegarde-${stamp}.zip`);
  return { mediaIncluded: included };
}
