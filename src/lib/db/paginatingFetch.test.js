import { describe, it, expect } from 'vitest';
import { createPaginatingFetch, paginableTable, PAGE_SIZE } from './paginatingFetch.js';

const BASE = 'https://x.supabase.co/rest/v1';

function rows(n, start = 0) {
  return Array.from({ length: n }, (_, i) => ({ id: start + i }));
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Faux serveur : `total` lignes dans la table, plafonné à PAGE_SIZE par réponse. */
function fakeServer(total) {
  const calls = [];
  const baseFetch = async (url) => {
    calls.push(url);
    const params = new URL(url).searchParams;
    const offset = Number(params.get('offset') || 0);
    const limit = Math.min(Number(params.get('limit') || PAGE_SIZE), PAGE_SIZE);
    return jsonResponse(rows(Math.max(0, Math.min(limit, total - offset)), offset));
  };
  return { baseFetch, calls };
}

describe('paginableTable', () => {
  it('reconnaît une lecture de liste simple', () => {
    expect(paginableTable(`${BASE}/events?select=*`, { method: 'GET' })).toBe('events');
  });
  it('ignore écritures, RPC, lectures limitées, lectures d\'une seule ligne et Storage', () => {
    expect(paginableTable(`${BASE}/events`, { method: 'POST' })).toBeNull();
    expect(paginableTable(`${BASE}/rpc/merge_unions`, { method: 'GET' })).toBeNull();
    expect(paginableTable(`${BASE}/events?select=*&limit=1`, {})).toBeNull();
    expect(paginableTable(`${BASE}/events?select=*`, { headers: { Accept: 'application/vnd.pgrst.object+json' } })).toBeNull();
    expect(paginableTable(`${BASE}/events?select=*`, { headers: new Headers({ Range: '0-9' }) })).toBeNull();
    expect(paginableTable('https://x.supabase.co/storage/v1/object/media/a.jpg', {})).toBeNull();
  });
});

describe('createPaginatingFetch', () => {
  it('ne relit rien quand la réponse n\'est pas pleine', async () => {
    const { baseFetch, calls } = fakeServer(250);
    const res = await createPaginatingFetch(baseFetch)(`${BASE}/events?select=*`, { method: 'GET' });
    expect(await res.json()).toHaveLength(250);
    expect(calls).toHaveLength(1);
  });

  it('relit toutes les pages quand la première réponse est pleine', async () => {
    const { baseFetch, calls } = fakeServer(2350);
    const res = await createPaginatingFetch(baseFetch)(`${BASE}/events?select=*`, { method: 'GET' });
    const all = await res.json();
    expect(all).toHaveLength(2350);
    expect(new Set(all.map((r) => r.id)).size).toBe(2350);
    expect(calls).toHaveLength(4); // 1 lecture d'origine + 3 pages
    expect(new URL(calls[1]).searchParams.get('order')).toBe('id');
  });

  it('gère une table qui contient exactement une page pleine', async () => {
    const { baseFetch } = fakeServer(PAGE_SIZE);
    const res = await createPaginatingFetch(baseFetch)(`${BASE}/events?select=*`, {});
    expect(await res.json()).toHaveLength(PAGE_SIZE);
  });

  it('garde l\'ordre demandé et départage par la clé primaire (y compris composée)', async () => {
    const { baseFetch, calls } = fakeServer(1500);
    await createPaginatingFetch(baseFetch)(`${BASE}/union_partners?select=*&order=union_id.desc`, {});
    expect(new URL(calls[1]).searchParams.get('order')).toBe('union_id.desc,union_id,individual_id');
  });

  it('laisse passer les écritures sans les toucher', async () => {
    const calls = [];
    const baseFetch = async (url, init) => { calls.push([url, init]); return jsonResponse(rows(PAGE_SIZE)); };
    await createPaginatingFetch(baseFetch)(`${BASE}/events`, { method: 'POST' });
    expect(calls).toHaveLength(1);
  });

  it('renvoie la première réponse telle quelle si une page échoue', async () => {
    let n = 0;
    const baseFetch = async () => (n++ === 0 ? jsonResponse(rows(PAGE_SIZE)) : jsonResponse({ message: 'boom' }, 500));
    const res = await createPaginatingFetch(baseFetch)(`${BASE}/events?select=*`, {});
    expect(await res.json()).toHaveLength(PAGE_SIZE);
  });
});
