/** Déclenche le téléchargement d'un Blob dans le navigateur, sans dépendance externe. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text, filename, mime = 'text/plain') {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

export function downloadJson(obj, filename) {
  downloadText(JSON.stringify(obj, null, 2), filename, 'application/json');
}

/** Horodatage compact pour les noms de fichiers d'export (ex: 2026-11-13). */
export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}
