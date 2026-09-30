// PWA service-worker registration + update handling.
// Registered only in production builds so dev never serves stale cached assets.
//
// Update UX (audit F10): a new build must never reload the page out from under a shopkeeper who is
// mid-form. The service worker installs but WAITS (it does not skipWaiting). When an update is ready we
// show a persistent, user-controlled "Refresh" prompt; only when the user taps it do we activate the
// new worker (postMessage SKIP_WAITING) and reload. If the user ignores it, the update still applies
// naturally the next time the app is fully reopened — so it can't get stuck on a stale build, and it
// can't interrupt work either.
import React from 'react';
import toast from 'react-hot-toast';

// A dismissible toast with a Refresh button. Built with createElement so this .js file needs no JSX
// transform. Tapping Refresh tells the waiting worker to take over; controllerchange then reloads.
function promptRefresh(waitingWorker) {
  if (!waitingWorker) return;
  toast(
    (t) => React.createElement(
      'div',
      { className: 'flex items-center gap-3' },
      React.createElement('span', { className: 'text-sm' }, 'New version of Vendora is ready.'),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => { toast.dismiss(t.id); try { waitingWorker.postMessage('SKIP_WAITING'); } catch { /* ignore */ } },
          className: 'shrink-0 rounded-lg bg-primary px-3 py-1 text-sm font-semibold text-white',
        },
        'Refresh',
      ),
    ),
    { id: 'sw-update', duration: Infinity },
  );
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  // Whether an app was already controlling this page when it loaded. On the very first install the
  // worker claims the page (controllerchange fires) but there is nothing to swap — so we must only
  // reload on controllerchange when this is a genuine UPDATE, not first control.
  const hadController = !!navigator.serviceWorker.controller;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return; // first install, or already reloading — don't loop
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Nudge the browser to look for a newer sw.js on each load.
        try { registration.update(); } catch { /* ignore */ }

        // An update may already be sitting waiting from a previous visit — offer it now.
        if (registration.waiting && navigator.serviceWorker.controller) {
          promptRefresh(registration.waiting);
        }

        // A newer worker started installing — offer Refresh once it's installed and ready.
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              promptRefresh(registration.waiting || installing);
            }
          });
        });
      })
      .catch(() => {
        // Registration failure is non-fatal — the app still works online.
      });
  });
}
