'use strict';

// Service worker (since 0.46.3), so the dashboard can be an app on the phone (manifest.webmanifest).
// Always the network first: that way you never get an old version. Only when that fails (offline) does the last
// loaded file come from the cache. Only this site's app files; no data (data/, archive, APIs, other sites).
// dash.js registers sw.js?v=<version>: a new version = a new service worker with its own cache, and the old
// cache is thrown away on activation.
const VERSION = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE = `dashboard-${VERSION}`;

self.addEventListener('install', (e) => {
  // The page itself in advance, so the app also opens offline after the first time
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dashboard-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// What may go in the cache: GET on this site, no data and no login return (?code=)
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
  if (!cacheable(req)) return;   // just the network, without the service worker in between
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      // Offline: the same file from the cache (a page also without ?demo / ?mini=1 etc.)
      const nav = req.mode === 'navigate';
      const hit = await caches.match(req, { ignoreSearch: nav }) || (nav && await caches.match('./', { ignoreSearch: true }));
      if (hit) return hit;
      throw err;
    }
  })());
});
