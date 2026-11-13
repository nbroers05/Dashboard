'use strict';

// Service worker (sinds 0.46.3), zodat het dashboard als app op de telefoon kan (manifest.webmanifest).
// Altijd eerst het netwerk: zo krijg je nooit een oude versie. Alleen als dat niet lukt (offline) komt het laatst
// geladen bestand uit de cache. Alleen de app-bestanden van deze site; geen data (data/, archief, API's, andere sites).
// dash.js registreert sw.js?v=<versie>: een nieuwe versie = een nieuwe service worker met een eigen cache, en de oude
// cache wordt bij het activeren weggegooid.
const VERSION = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE = `dashboard-${VERSION}`;

self.addEventListener('install', (e) => {
  // Alvast de pagina zelf, zodat de app ook offline opent na de eerste keer
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dashboard-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Wat mag in de cache: GET op deze site, geen data en geen inlog-terugkeer (?code=)
function cacheable(req) {
  if (req.method !== 'GET') return false;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (/^(data|helper)\//.test(path) || path === 'vault.json' || url.searchParams.has('code')) return false;
  return true;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (!cacheable(req)) return;   // gewoon het netwerk, zonder service worker ertussen
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      // Offline: zelfde bestand uit de cache (een pagina ook zonder ?demo / ?mini=1 enz.)
      const nav = req.mode === 'navigate';
      const hit = await caches.match(req, { ignoreSearch: nav }) || (nav && await caches.match('./', { ignoreSearch: true }));
      if (hit) return hit;
      throw err;
    }
  })());
});
