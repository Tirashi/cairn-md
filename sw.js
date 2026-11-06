// Service worker de Cairn : l'application s'ouvre et fonctionne sans réseau.
// - Fichiers de Cairn (même origine) : réseau d'abord (toujours la dernière version en ligne),
//   cache si le réseau manque ou tarde plus de 3 s.
// - Bibliothèques du CDN (versions épinglées, donc immuables) et police : cache d'abord.
// - Supabase et tout le reste : jamais mis en cache (les notes hors ligne sont dans IndexedDB).
// Ajouter ici tout nouveau fichier de l'application (l'essai vérifie que js/ est complet).
const VERSION = 'cairn-v1';
const COQUILLE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'assets/logo.svg',
  'assets/icon-maskable.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/apple-touch-icon.png',
  'js/arbre.js',
  'js/auth.js',
  'js/config.js',
  'js/dialogue.js',
  'js/export.js',
  'js/import-dialogue.js',
  'js/installation.js',
  'js/liens.js',
  'js/local.js',
  'js/main.js',
  'js/markdown.js',
  'js/defilement.js',
  'js/meta.js',
  'js/navigation.js',
  'js/notes.js',
  'js/palette.js',
  'js/rendu-avance.js',
  'js/suggestions.js',
  'js/supabase.js',
  'js/sync-dialogue.js',
  'js/theme.js',
  'js/ui.js',
];
const CACHE_APP = VERSION + '-app';
const CACHE_CDN = 'cairn-cdn';          // gardé d'une version à l'autre : les URL sont versionnées

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_APP)
      .then((c) => c.addAll(COQUILLE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE_APP && k !== CACHE_CDN).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function avecDelai(promesse, ms) {
  return new Promise((ok, ko) => {
    const t = setTimeout(() => ko(new Error('délai')), ms);
    promesse.then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); ko(e); });
  });
}

async function reseauDabord(requete) {
  const cache = await caches.open(CACHE_APP);
  try {
    const reponse = await avecDelai(fetch(requete), 3000);
    if (reponse.ok) cache.put(requete, reponse.clone());
    return reponse;
  } catch {
    const enCache = await cache.match(requete, { ignoreSearch: true })
      || (requete.mode === 'navigate' ? await cache.match('index.html') : null);
    if (enCache) return enCache;
    throw new Error('hors ligne et absent du cache');
  }
}

async function cacheDabord(requete) {
  const cache = await caches.open(CACHE_CDN);
  const enCache = await cache.match(requete);
  if (enCache) return enCache;
  const reponse = await fetch(requete);
  if (reponse.ok || reponse.type === 'opaque') cache.put(requete, reponse.clone());
  return reponse;
}

self.addEventListener('fetch', (e) => {
  const requete = e.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin === self.location.origin) {
    e.respondWith(reseauDabord(requete));
  } else if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(cacheDabord(requete));
  }
  // Supabase et le reste : pas d'interception.
});
