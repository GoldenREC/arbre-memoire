/**
 * Import d'un acte collé en texte (JSON produit par une IA à partir d'une
 * photo d'acte — voir docs/PROMPT_ACTE.md) accompagné du ou des scans
 * choisis à la main, sans avoir à fabriquer un .zip.
 *
 * Fonctions pures : extraction du JSON d'une réponse d'IA (qui l'entoure
 * souvent de texte ou d'un bloc ```json), et association des chemins
 * `imageFile` cités dans le JSON aux fichiers réellement fournis.
 */

/** Extrait l'objet JSON d'un texte collé (tolère un bloc ```json … ``` et du texte autour). */
export function extractJson(text) {
  const raw = (text || '').trim();
  if (!raw) throw new Error('Colle le JSON de l’acte avant de continuer.');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error('Ce texte n’est pas un JSON valide. Copie la réponse complète de l’IA, de la première accolade { à la dernière }.');
  }
}

/** Tous les chemins `imageFile` cités dans le modèle, sans doublon. */
export function collectImagePaths(node, found = new Set()) {
  if (Array.isArray(node)) node.forEach((n) => collectImagePaths(n, found));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'imageFile' && typeof value === 'string' && value.trim()) found.add(value);
      else collectImagePaths(value, found);
    }
  }
  return found;
}

/**
 * Associe chaque chemin cité à un fichier fourni : par nom de fichier
 * quand il correspond, sinon — cas d'un acte d'une seule page — le
 * fichier unique sert pour tous les chemins. Retourne
 * { imagesByPath, missing } (missing : chemins restés sans fichier).
 */
export function matchImages(paths, files) {
  const byName = new Map(files.map((f) => [f.name.toLowerCase(), f]));
  const imagesByPath = new Map();
  const missing = [];
  for (const path of paths) {
    const base = path.split('/').pop().toLowerCase();
    const file = byName.get(base) || (files.length === 1 ? files[0] : null);
    if (file) imagesByPath.set(path, file);
    else missing.push(path);
  }
  return { imagesByPath, missing };
}
