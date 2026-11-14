import { create } from 'zustand';

let nextId = 1;

/**
 * Confirmations de sauvegarde (et erreurs) affichées brièvement en bas
 * de l'écran — "ce que j'effectue dans mon arbre" (ajout/retrait d'un
 * lien familial, modification de l'état civil, d'une note, d'une
 * source, d'un acte...) a maintenant une confirmation visible, y
 * compris pour les écritures qui se font sans bouton "Enregistrer"
 * dédié (ex: ajouter/retirer un parent). Voir ToastHost.jsx pour
 * l'affichage, et pushToast()/pushErrorToast() ci-dessous pour l'usage
 * côté composants.
 */
export const useToastStore = create((set, get) => ({
  toasts: [],

  push: (type, message) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => get().dismiss(id), type === 'error' ? 6000 : 3000);
    return id;
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Confirmation de sauvegarde réussie. */
export function pushToast(message) {
  return useToastStore.getState().push('success', message);
}

/** Erreur d'enregistrement — reste affichée plus longtemps que le succès. */
export function pushErrorToast(message) {
  return useToastStore.getState().push('error', message || "Une erreur est survenue pendant l'enregistrement.");
}
