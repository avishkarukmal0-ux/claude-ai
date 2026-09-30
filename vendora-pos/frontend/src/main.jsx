import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import { registerServiceWorker } from './pwa.js';
import { migrateLegacyToLocalOnce, initStorage, hasAnyLocalData } from './lib/storage.js';
import { startSync } from './lib/sync.js';
import './index.css';

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { borderRadius: '8px', fontFamily: 'Inter, sans-serif' },
          success: { style: { background: '#16A34A', color: '#fff' } },
          error:   { style: { background: '#DC2626', color: '#fff' } },
        }}
      />
    </React.StrictMode>
  );
  registerServiceWorker();
}

async function boot() {
  // One-time, non-destructive: copy any pre-scoping data into the guest workspace so existing
  // users keep seeing their data under the new scoped storage. Runs before React reads stores.
  migrateLegacyToLocalOnce();

  // Durability (infra Stage 1): mirror on-device data into IndexedDB and restore anything that
  // localStorage lost (evicted or over its ~5MB cap). If there IS on-device data, render straight
  // away and let IndexedDB reconcile in the background (no delay). If localStorage looks empty, a
  // previous session's data may still live in IndexedDB — briefly wait for recovery before the
  // first paint so the user never sees a false "fresh start". Non-destructive either way.
  const init = initStorage();
  if (!hasAnyLocalData()) {
    try { await init; } catch { /* fall through to render regardless */ }
  }
  renderApp();

  // Cross-device sync (infra Stage 3). No-ops unless accounts are enabled AND a shop is signed in;
  // runs entirely in the background so it never delays first paint. Local data stays authoritative.
  try { startSync(); } catch { /* sync is best-effort */ }
}

boot();
