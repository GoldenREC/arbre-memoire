/**
 * Lecture d'un fichier d'import personnalisé (docs/IMPORT_FORMAT.md) :
 * soit un .json brut (aucune image, preuves en permalien uniquement),
 * soit un .zip contenant arbre.json + un dossier images/. Même
 * convention de lecture de zip que MaintenancePanel.jsx (restauration de
 * sauvegarde) : JSZip côté navigateur, rien n'est envoyé au serveur à
 * cette étape.
 */
import JSZip from 'jszip';

/**
 * Retourne { model, imagesByPath } où `model` est le JSON brut (non
 * encore validé — voir validate.js) et `imagesByPath` une Map
 * "images/xxx.jpg" -> File, vide pour un .json sans image.
 */
export async function parseCustomImportFile(file) {
  if (file.name.toLowerCase().endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file);
    const dataEntry = zip.file('arbre.json');
    if (!dataEntry) {
      throw new Error("Ce .zip ne contient pas de arbre.json à la racine — voir docs/IMPORT_FORMAT.md.");
    }
    const model = JSON.parse(await dataEntry.async('string'));

    // Note : zip.folder('images').files renvoie TOUTES les entrées du zip
    // (JSZip ne filtre pas par dossier), donc on filtre nous-mêmes par
    // préfixe de chemin — même piège déjà rencontré dans MaintenancePanel.jsx.
    const imageEntries = Object.values(zip.files).filter((f) => !f.dir && f.name.startsWith('images/'));
    const imagesByPath = new Map();
    for (const entry of imageEntries) {
      const blob = await entry.async('blob');
      const filename = entry.name.split('/').pop();
      imagesByPath.set(entry.name, new File([blob], filename, { type: blob.type || 'application/octet-stream' }));
    }
    return { model, imagesByPath };
  }

  const model = JSON.parse(await file.text());
  return { model, imagesByPath: new Map() };
}
