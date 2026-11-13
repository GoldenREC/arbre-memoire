import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient.js';
import { fetchMyTrees, createFirstTree } from '../lib/db/bootstrapTree.js';

/**
 * État d'authentification + rôle de l'utilisateur sur l'arbre courant.
 * role vaut 'admin' | 'family' | 'guest' | null (non connecté).
 * preferences / privacyThresholdYears concernent toujours l'arbre
 * courant (currentTreeId) — voir features/settings/.
 */
export const useAuthStore = create((set, get) => ({
  user: null,
  role: null,
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
        set({ role: null, currentTreeId: null, trees: [], preferences: null, privacyThresholdYears: 100 });
      }
    });
  },

  loadTrees: async () => {
    let trees = await fetchMyTrees();
    // Sur la page d'acceptation d'une invitation, un compte tout juste
    // créé n'a encore AUCUNE adhésion au moment où ce listener se
    // déclenche (l'appel à accept_invitation() arrive juste après) :
    // on ne doit pas lui créer un arbre perso à la place de celui
    // auquel il vient d'être invité. InviteAcceptPage rappelle
    // loadTrees() lui-même une fois l'invitation acceptée.
    const onInvitePage = typeof window !== 'undefined' && window.location.pathname.startsWith('/invite/');
    if (trees.length === 0 && !onInvitePage) {
      await createFirstTree('Mon arbre');
      trees = await fetchMyTrees();
    }
    const current = trees[0];
    set({
      trees,
      currentTreeId: current?.id ?? null,
      role: current?.role ?? null,
      preferences: current?.preferences ?? null,
      privacyThresholdYears: current?.privacyThresholdYears ?? 100,
    });
  },

  setCurrentTreeId: (treeId) => {
    const tree = get().trees.find((t) => t.id === treeId);
    set({
      currentTreeId: treeId,
      role: tree?.role ?? null,
      preferences: tree?.preferences ?? null,
      privacyThresholdYears: tree?.privacyThresholdYears ?? 100,
    });
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
    set({ user: null, role: null, currentTreeId: null, trees: [], preferences: null, privacyThresholdYears: 100 });
  },
}));
