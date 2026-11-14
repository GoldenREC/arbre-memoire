// Service worker minimal : rend l'application installable (critère technique
// de Chrome/Android pour la bannière "Ajouter à l'écran d'accueil") et permet
// de recharger la coquille de l'app (JS/CSS/HTML) hors connexion une fois
// qu'elle a déjà été visitée en ligne au moins une fois.
//
// Volontairement minimaliste et sûr : aucune requête vers Supabase (ou tout
// autre domaine distant — Auth, REST, Realtime, Storage) n'est jamais
// interceptée ni mise en cache, seulement les requêtes GET vers notre propre
// origine (les fichiers statiques buildés par Vite). Les données
// généalogiques restent donc toujours lues en direct sur le réseau, jamais
// servies périmées depuis un cache.

const CACHE_VERSION = 'am-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Seules les requêtes GET vers notre propre origine passent par ce cache.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        // Réseau d'abord : la dernière version déployée est toujours servie
        // tant que la connexion fonctionne, sans jamais afficher une coquille
        // périmée à quelqu'un qui est en ligne.
        const response = await fetch(request);
        if (response && response.status === 200) {
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        // Hors ligne : on retombe sur la dernière version mise en cache.
        const cached = await cache.match(request);
        if (cached) return cached;
        throw new Error('Hors ligne et rien en cache pour cette ressource.');
      }
    })()
  );
});
