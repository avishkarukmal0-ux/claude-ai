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

// Audit FE6: only the tab whose user tapped "Refresh" should reload on controllerchange — other open tabs
// (possibly mid-form) must keep their page. This module flag records that THIS tab consented.
let _userAskedRefresh = false;

// Audit F2: show the "new version" banner ONCE per new version, not repeatedly during normal use. Each new
// build is a distinct waiting-worker object, so we remember the one we've already prompted for and skip it.
let _promptedWorker = null;

// Post the exact hashed JS/CSS this page loaded to a worker so it can precache them for offline use.
function warmAssets(sw) {
  if (!sw) return;
  try {
    const urls = [...document.querySelectorAll('script[src], link[rel="stylesheet"][href]')]
      .map((el) => el.src || el.href)
      .filter((u) => u && u.startsWith(self.location.origin));
    if (urls.length) sw.postMessage({ type: 'CACHE_ASSETS', urls });
  } catch { /* best-effort warming */ }
}

// A dismissible toast with a Refresh button. Built with createElement so this .js file needs no JSX
// transform. Tapping Refresh tells the waiting worker to take over; controllerchange then reloads.
function promptRefresh(waitingWorker) {
  if (!waitingWorker) return;
  // F2: only once per new version. A repeat call for the SAME waiting worker (e.g. registration.update() on a
  // later load finding the same build) is ignored, so the banner doesn't re-nag during normal use.
  if (_promptedWorker === waitingWorker) return;
  _promptedWorker = waitingWorker;
  toast(
    (t) => React.createElement(
      'div',
      { className: 'flex items-center gap-3' },
      React.createElement('span', { className: 'text-sm' }, 'New version of Vendora is ready.'),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => { _userAskedRefresh = true; toast.dismiss(t.id); try { waitingWorker.postMessage('SKIP_WAITING'); } catch { /* ignore */ } },
          className: 'shrink-0 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white active:scale-95',
        },
        'Refresh',
      ),
    ),
    { id: 'sw-update', duration: Infinity },
  );
}

// Pure decision for a `controllerchange` event (audit L-F1) — exported for tests.
//   consented  → THIS tab tapped Refresh: reload once, even if its controller first arrived this session.
//   !controlled → first control (no prior worker): warm the cache, don't reload.
//   controlled, no consent → another tab's update: leave this (possibly mid-form) page alone.
export function decideControllerChange({ controlled, consented }) {
  if (consented) return { reload: true, warm: false };
  if (!controlled) return { reload: false, warm: true };
  return { reload: false, warm: false };
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  // Whether an app is controlling this page. On the very first install the worker claims the page
  // (controllerchange fires) but there is nothing to swap — so first control only warms the cache, it does
  // not reload. This is MUTABLE: once the first worker takes control, a LATER controllerchange in the same tab
  // is a genuine update (audit L-F1 — it used to stay false forever, so an update accepted in a first-visit
  // tab warmed instead of reloading and the Refresh button did nothing until a manual reload).
  let controlled = !!navigator.serviceWorker.controller;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const d = decideControllerChange({ controlled, consented: _userAskedRefresh });
    controlled = true; // after any control, a later change is a genuine update (L-F1)
    if (d.reload) { if (!refreshing) { refreshing = true; window.location.reload(); } return; }
    if (d.warm) warmAssets(navigator.serviceWorker.controller); // FE7: first-install offline warm
  });

  // Audit FE9: registration must not depend ONLY on a future `load` event. boot() can await IndexedDB
  // hydration past `load`, so a listener added afterwards never fires and the worker is never registered
  // (the PWA then can't reopen offline). Register immediately when the document is already loaded; otherwise
  // attach a one-shot load listener.
  const whenReady = (fn) => {
    if (document.readyState === 'complete') fn();
    else window.addEventListener('load', fn, { once: true });
  };

  // Preview the "New version is ready" banner on demand (?swUpdatePreview=1) so its Refresh button can be
  // measured on screen without waiting for a real worker update. The button is inert here (dummy worker →
  // postMessage no-ops), it just dismisses. Harmless if a visitor hits the param; purely a visual preview.
  try {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('swUpdatePreview') === '1') {
      promptRefresh({ postMessage() { /* preview only — no real worker to activate */ } });
    }
  } catch { /* ignore */ }

  whenReady(() => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Nudge the browser to look for a newer sw.js on each load.
        try { registration.update(); } catch { /* ignore */ }

        // Warm the active worker's cache with this page's assets. If there's no controller yet (first
        // install), the controllerchange handler above warms it once the worker takes control (FE7).
        warmAssets(navigator.serviceWorker.controller);

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
