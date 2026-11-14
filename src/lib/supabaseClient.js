import { createClient } from '@supabase/supabase-js';
import { createPaginatingFetch } from './db/paginatingFetch.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // En dev, on préfère un message clair plutôt qu'une erreur Supabase
  // opaque plus loin dans l'app.
  // eslint-disable-next-line no-console
  console.warn(
    '[Supabase] Variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes. ' +
    'Copie .env.example en .env.local et renseigne ton projet Supabase.'
  );
}

// createClient rejette une URL vide immédiatement (avant même le premier
// appel réseau) : sans placeholder valide, l'avertissement ci-dessus
// n'aurait jamais le temps de s'afficher, l'app planterait au chargement.
//
// `global.fetch` : toutes les lectures passent par paginatingFetch, qui
// relit page par page celles que Supabase aurait tronquées à 1 000 lignes
// (voir lib/db/paginatingFetch.js).
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-anon-key', {
  global: { fetch: createPaginatingFetch() },
});
