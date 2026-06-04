/* ============================================================
   sw.js — Service Worker para funcionamiento offline
   Estrategia: cache-first para los archivos de la app.
   ============================================================ */
const CACHE = 'kleno-salones-v7';
const ARCHIVOS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/db.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/logo-topbar.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // No cachear llamadas a Nominatim (búsquedas vivas) ni a tiles del mapa
  // (sería un cache enorme y dinámico).
  if (url.hostname.includes('nominatim.openstreetmap.org') ||
      url.hostname.includes('tile.openstreetmap.org')) {
    e.respondWith(fetch(req).catch(() => new Response('', { status: 504 })));
    return;
  }
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
