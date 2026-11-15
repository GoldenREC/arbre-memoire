import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient.js';
import { fetchMyTrees, createTree, createFirstTree } from '../lib/db/bootstrapTree.js';
import { clearStagingArea } from '../lib/db/localDb.js';

const CURRENT_TREE_KEY = 'am-current-tree-id';

function readSavedTreeId() {
  try { return window.localStorage.getItem(CURRENT_TREE_KEY); } catch { return null; }
}
function saveTreeId(treeId) {
  try {
    if (treeId) window.localStorage.setItem(CURRENT_TREE_KEY, treeId);
    else window.localStorage.removeItem(CURRENT_TREE_KEY);
  } catch { /* stockage indisponible : le choix ne sera pas mémorisé */ }
}

/** Champs dérivés de l'arbre courant (rôle, propriété, préférences, seuil RGPD). */
function currentFields(tree) {
  return {
    role: tree?.role ?? null,
    isOwner: !!tree?.isOwner,
    preferences: tree?.preferences ?? null,
    privacyThresholdYears: tree?.privacyThresholdYears ?? 100,
  };
}

/**
 * État d'authentification + arbre courant. role vaut 'admin' | 'guest' |
 * null (non connecté) ; isOwner est vrai pour le propriétaire de l'arbre
 * courant (il est aussi 'admin'). Le choix de l'arbre est mémorisé dans le
 * navigateur. Voir supabase/multi_tree.sql pour les règles réelles.
 */
export const useAuthStore = create((set, get) => ({
  user: null,
  role: null,
  isOwner: false,
  currentTreeId: null,
  trees: [],
  preferences: null,
  privacyThresholdYears: 100,
  loading: true,
  error: null,

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    set({ user: session?.user ?? null });
    if (session?.user) await get().loadTrees();
    set({ loading: false });

    supabase.auth.onAuthStateChange((_event, newSession) => {
      set({ user: newSession?.user ?? null });
      if (newSession?.user) {
        get().loadTrees();
      } else {
        set({ role: null, isOwner: false, currentTreeId: null, trees: [], preferences: null, privacyThresholdYears: 100 });
      }
    });
  },

  loadTrees: async () => {
    const userId = get().user?.id;
    let trees = await fetchMyTrees(userId);
    // Sur la page d'acceptation d'une invitation, un compte tout juste
    // créé n'a encore AUCUNE adhésion au moment où ce listener se
    // déclenche (l'appel à accept_invitation() arrive juste après) :
    // on ne doit pas lui créer un arbre perso à la place de celui
    // auquel il vient d'être invité. InviteAcceptPage rappelle
    // loadTrees() lui-même une fois l'invitation acceptée.
    const onInvitePage = typeof window !== 'undefined' && window.location.pathname.startsWith('/invite/');
    if (trees.length === 0 && !onInvitePage) {
      await createFirstTree('Mon arbre');
      trees = await fetchMyTrees(userId);
    }
    // On reprend l'arbre mémorisé s'il existe encore, sinon le premier.
    const saved = readSavedTreeId();
    const current = trees.find((t) => t.id === saved) ?? trees[0];
    saveTreeId(current?.id ?? null);
    set({ trees, currentTreeId: current?.id ?? null, ...currentFields(current) });
  },

  /** Change d'arbre. Les données en attente d'import (IndexedDB) sont vidées : elles appartenaient à l'ancien arbre. */
  setCurrentTreeId: async (treeId) => {
    const tree = get().trees.find((t) => t.id === treeId);
    if (!tree) return;
    if (treeId !== get().currentTreeId) {
      await clearStagingArea().catch(() => {});
    }
    saveTreeId(treeId);
    set({ currentTreeId: treeId, ...currentFields(tree) });
  },

  /** Crée un arbre, puis bascule dessus. Renvoie son identifiant. */
  createTree: async (name) => {
    const newId = await createTree(name.trim());
    await get().loadTrees();
    await get().setCurrentTreeId(newId);
    return newId;
  },

  /** Renomme l'arbre courant dans la liste locale (la base est écrite par l'appelant). */
  renameLocalTree: (treeId, name) => {
    set((s) => ({ trees: s.trees.map((t) => (t.id === treeId ? { ...t, name } : t)) }));
  },

  /** Fusionne un patch de préférences localement (après écriture réussie en base — voir settingsMutations.js). */
  setPreferences: (patch) => {
    set((s) => ({ preferences: s.preferences ? { ...s.preferences, ...patch } : patch }));
    set((s) => ({ trees: s.trees.map((t) => (t.id === s.currentTreeId ? { ...t, preferences: { ...t.preferences, ...patch } } : t)) }));
  },

  signInWithPassword: async (email, password) => {
    set({ error: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { set({ error: error.message }); throw error; }
  },

  signUp: async (email, password, options = {}) => {
    set({ error: null });
    const { error } = await supabase.auth.signUp({ email, password, options });
    if (error) { set({ error: error.message }); throw error; }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    saveTreeId(null);
    set({ user: null, role: null, isOwner: false, currentTreeId: null, trees: [], preferences: null, privacyThresholdYears: 100 });
  },
}));
