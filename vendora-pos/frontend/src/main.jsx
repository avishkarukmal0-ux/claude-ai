import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import { registerServiceWorker } from './pwa.js';
import { migrateLegacyToLocalOnce } from './lib/storage.js';
import './index.css';

// One-time, non-destructive: copy any pre-scoping data into the guest workspace so existing
// users keep seeing their data under the new scoped storage. Runs before React reads stores.
migrateLegacyToLocalOnce();

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
