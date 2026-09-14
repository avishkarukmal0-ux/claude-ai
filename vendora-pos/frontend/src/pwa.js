// PWA service-worker registration + update handling.
// Registered only in production builds so dev never serves stale cached assets.
import toast from 'react-hot-toast';

export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Notify when a new version has been installed and is waiting.
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              toast('A new version of Vendora is ready — reopen to update.', { icon: '🔄', duration: 6000 });
            }
          });
        });
      })
      .catch(() => {
        // Registration failure is non-fatal — the app still works online.
      });
  });
}
