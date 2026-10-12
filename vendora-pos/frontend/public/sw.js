/* Vendora POS service worker — app-shell offline support.
 * Strategy:
 *   - /api and /socket.io: always network (never cached — live data + realtime).
 *   - navigations: network-first, fall back to cached shell when offline.
 *   - other same-origin GETs (built JS/CSS/icons): stale-while-revalidate.
 * Bump CACHE_VERSION whenever this file or the precache list changes.
 */
const CACHE_VERSION = 'vendora-v19';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Minimal shell to precache so the app opens offline.
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.svg',
];

/** Put a URL in the cache, best-effort (never throws). */
async function cachePut(cache, url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); if (r && r.ok) await cache.put(url, r.clone()); } catch { /* ignore */ }
}

/** Cache a REQUIRED asset — THROWS if it can't be fetched/cached, so a failed required chunk aborts the install
 *  (audit F10 r2) instead of leaving a half-cached shell that blanks on the first offline load. */
async function cachePutRequired(cache, url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r || !r.ok) throw new Error(`precache(required) failed: ${url} (${r && r.status})`);
  await cache.put(url, r.clone());
}

/**
 * Precache the COMPLETE built entry asset graph (audit F10): fetch index.html and cache every same-origin
 * JS/CSS/font it references — the module entry, its `<link rel="modulepreload">` chunks (vendor-react, vendor-ui,
 * vendor-forms, …) and stylesheets. Without this, a fresh install opened offline had the shell HTML but none of
 * its hashed assets → a blank page on first offline reload. Best-effort per asset; install waits for it, so the
 * worker only becomes ready once the entry graph is cached. Lazy route chunks are still filled in at runtime.
 */
async function precacheBuiltAssets(cache) {
  // index.html + the entry JS/CSS are REQUIRED: if any can't be cached the install THROWS (audit F10 r2), so the
  // worker never becomes ready with an incomplete shell — the old worker keeps serving a complete one and the
  // browser retries the install. Fonts (woff/woff2) stay best-effort so a missing font can't block an install.
  const res = await fetch('/index.html', { cache: 'no-cache' });
  if (!res || !res.ok) throw new Error('precache: index.html unavailable');
  await cache.put('/index.html', res.clone());
  const html = await res.text();
  const required = new Set();
  const optional = new Set();
  const re = /(?:href|src)\s*=\s*"([^"]+\.(?:js|css|woff2?))(?:\?[^"]*)?"/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = m[1];
    if (!u.startsWith('/')) continue;
    (/\.(?:js|css)$/i.test(u) ? required : optional).add(u);
  }
  await Promise.all([...optional].map((u) => cachePut(cache, u)));          // fonts — best-effort
  await Promise.all([...required].map((u) => cachePutRequired(cache, u)));  // entry JS/CSS — must cache or install fails
}

self.addEventListener('install', (event) => {
  // Precache the shell AND the full built entry asset graph, then WAIT. We deliberately do NOT skipWaiting here:
  // a new build must not activate and reload the page out from under a shopkeeper who's mid-form. The new worker
  // sits in "waiting" until the user taps Refresh (client posts SKIP_WAITING) — or until the app is next fully
  // reopened, which activates it naturally. Shell assets are cached individually (best-effort) so one missing
  // icon can't abort the whole install.
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_ASSETS.map((u) => cachePut(cache, u)));
    await precacheBuiltAssets(cache);
  })());
});

self.addEventListener('activate', (event) => {
  // Delete every cache that isn't part of THIS version — the previous version's shell AND its runtime cache
  // (the accumulated stale-while-revalidate bundle of now-dead hashed JS/CSS). Because the runtime cache name
  // is version-scoped, bumping CACHE_VERSION makes this purge the old runtime bundles instead of letting them
  // pile up across deploys. Only `${CACHE_VERSION}-shell` and `${CACHE_VERSION}-runtime` survive.
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data === 'SKIP_WAITING') { self.skipWaiting(); return; }
  // The page sends the exact (hashed) JS/CSS it just loaded so we can precache them into the runtime
  // cache right after first successful load — otherwise a fresh install opened offline would have the
  // shell HTML but none of its hashed assets (audit: offline shell doesn't precache built JS/CSS).
  if (data && data.type === 'CACHE_ASSETS' && Array.isArray(data.urls)) {
    event.waitUntil(
      caches.open(RUNTIME_CACHE).then((cache) => Promise.all(
        data.urls.map((u) => cache.match(u).then((hit) => (hit ? null : cache.add(u).catch(() => {}))))
      )),
    );
  }
});

// Tapping a digest notification focuses an open Vendora tab (or opens one). Local notifications are raised
// via registration.showNotification from the page (see lib/notifications.js).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('/');
      return undefined;
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never touch writes

  const url = new URL(request.url);

  // Same-origin only; let cross-origin (fonts, etc.) go straight to network.
  if (url.origin !== self.location.origin) return;

  // Live data + realtime: never cache.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;

  // Navigations: network-first with offline shell fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Only cache a GOOD shell — never store an error page (404/500) as the offline fallback
          // (audit: cached shell could point to a non-OK response).
          if (res && res.ok) { const copy = res.clone(); caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy)); }
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
