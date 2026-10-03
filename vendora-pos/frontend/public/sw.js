/* Vendora POS service worker — app-shell offline support.
 * Strategy:
 *   - /api and /socket.io: always network (never cached — live data + realtime).
 *   - navigations: network-first, fall back to cached shell when offline.
 *   - other same-origin GETs (built JS/CSS/icons): stale-while-revalidate.
 * Bump CACHE_VERSION whenever this file or the precache list changes.
 */
const CACHE_VERSION = 'vendora-v5';
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

self.addEventListener('install', (event) => {
  // Precache the shell, then WAIT. We deliberately do NOT skipWaiting here (audit F10): a new build
  // must not activate and reload the page out from under a shopkeeper who's mid-form. The new worker
  // sits in "waiting" until the user taps Refresh (client posts SKIP_WAITING) — or until the app is
  // next fully reopened, which activates it naturally. So updates are prompt-driven, never disruptive,
  // and the app can't get stuck on a stale build.
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
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
