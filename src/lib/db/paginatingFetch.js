/**
 * Lecture complète au-delà de la limite de lignes de Supabase.
 *
 * PostgREST (l'API REST de Supabase) tronque toute lecture à 1 000 lignes
 * par défaut, sans erreur : au-delà, la carte, les statistiques, l'audit
 * et les exports deviendraient incomplets en silence. Plutôt que de
 * modifier une à une les dizaines de lectures de l'application, ce
 * `fetch` enveloppe celui du client Supabase (voir supabaseClient.js) :
 * dès qu'une lecture de liste revient exactement pleine (1 000 lignes),
 * il la relit page par page, dans un ordre stable, et renvoie le tout
 * comme une seule réponse. Les appelants ne voient aucune différence.
 *
 * Volontairement prudent : tout ce qui n'est pas une simple lecture de
 * liste sur une table (écritures, RPC, lecture d'une seule ligne,
 * requête déjà paginée ou limitée, Storage, Auth) passe tel quel, et au
 * moindre imprévu pendant la relecture on renvoie la première réponse
 * inchangée (le comportement d'avant).
 */

export const PAGE_SIZE = 1000;

// Tables sans colonne "id" : clé primaire composée, utilisée comme ordre
// stable de pagination. Toutes les autres tables sont triées par "id".
const COMPOSITE_ORDER = {
  tree_members: 'tree_id,user_id',
  union_partners: 'union_id,individual_id',
  media_links: 'media_id,subject_kind,subject_id',
  pet_links: 'pet_id,subject_kind,subject_id',
  followed_individuals: 'tree_id,user_id,individual_id',
};

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

/** Nom de la table si `url` est une lecture de liste paginable, sinon null. */
export function paginableTable(url, init = {}) {
  const method = (init.method || 'GET').toUpperCase();
  if (method !== 'GET') return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const match = parsed.pathname.match(/\/rest\/v1\/([a-z_][a-z0-9_]*)$/i);
  if (!match) return null; // RPC (/rest/v1/rpc/...), Storage, Auth...
  if (parsed.searchParams.has('limit') || parsed.searchParams.has('offset')) return null;
  if (headerValue(init.headers, 'Range')) return null;
  const accept = headerValue(init.headers, 'Accept') || '';
  if (accept.includes('vnd.pgrst.object')) return null; // .single() / .maybeSingle()
  return match[1];
}

function pageUrl(url, table, offset) {
  const parsed = new URL(url);
  const stable = COMPOSITE_ORDER[table] || 'id';
  const existing = parsed.searchParams.get('order');
  // L'ordre demandé par l'appelant reste prioritaire ; la clé primaire
  // ne sert qu'à départager les ex æquo, pour qu'aucune ligne ne soit
  // sautée ou lue deux fois d'une page à l'autre.
  parsed.searchParams.set('order', existing ? `${existing},${stable}` : stable);
  parsed.searchParams.set('limit', String(PAGE_SIZE));
  parsed.searchParams.set('offset', String(offset));
  return parsed.toString();
}

export function createPaginatingFetch(baseFetch = (...args) => fetch(...args)) {
  return async function paginatingFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const table = url ? paginableTable(url, init) : null;
    const first = await baseFetch(input, init);
    if (!table || !first.ok) return first;

    let firstRows;
    try {
      firstRows = await first.clone().json();
    } catch {
      return first;
    }
    if (!Array.isArray(firstRows) || firstRows.length !== PAGE_SIZE) return first;

    // Réponse exactement pleine : probablement tronquée. On relit tout
    // dans un ordre stable (la première lecture n'en avait pas forcément).
    try {
      const all = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const res = await baseFetch(pageUrl(url, table, offset), init);
        if (!res.ok) return first;
        const rows = await res.json();
        if (!Array.isArray(rows)) return first;
        all.push(...rows);
        if (rows.length < PAGE_SIZE) break;
      }
      const headers = new Headers(first.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      headers.delete('content-range');
      return new Response(JSON.stringify(all), { status: 200, statusText: 'OK', headers });
    } catch {
      return first;
    }
  };
}
