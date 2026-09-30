// PWA service-worker registration + update handling.
// Registered only in production builds so dev never serves stale cached assets.
import toast from 'react-hot-toast';

export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  // When a new service worker takes control (it calls skipWaiting on install), reload once so the
  // page swaps to the fresh app immediately — no more shops stuck on a stale cached build. Guarded
  // so it can never loop.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Nudge the browser to look for a newer sw.js on each load.
        try { registration.update(); } catch { /* ignore */ }
        // Brief heads-up if an update is applying (the controllerchange handler does the reload).
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              toast('Updating Vendora to the latest version…', { icon: '🔄', duration: 3000 });
            }
          });
        });
      })
      .catch(() => {
        // Registration failure is non-fatal — the app still works online.
      });
  });
}
