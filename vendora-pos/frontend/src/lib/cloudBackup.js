// Client for the server-side sync version history + restore (Phase 1.3). Talks to /api/pwa-sync/history*
// and /restore with the signed-in shop's token. Only meaningful when accounts/sync are on AND the backend
// has SYNC_HISTORY enabled; otherwise getCloudHistory() returns { enabled:false } and the UI says so.
// Transport is pluggable for tests (same pattern as sync.js / account.js).
import { currentSession } from './account';

const API_BASE = (() => {
  try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); }
  catch { return ''; }
})();
const BASE = `${API_BASE}/api/pwa-sync`;

async function fetchTransport(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error((data && data.message) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data || {};
}
let _transport = fetchTransport;
/** Inject a transport (tests). Pass nothing to restore real fetch. */
export function __setCloudTransport(t) { _transport = t || fetchTransport; }

function token() { const s = currentSession(); return s && s.token; }

/** { enabled, history: { storeName: [{ rev, mtime, at, kind, size }] } } */
export function getCloudHistory() { return _transport('/history', { token: token() }); }

/** The stored value of one historical revision. */
export function getCloudVersion(name, rev) {
  return _transport(`/history/${encodeURIComponent(name)}/${encodeURIComponent(rev)}`, { token: token() });
}

/** Restore a store to a prior revision (owner/manager only — server enforces). */
export function restoreCloudVersion(name, rev) {
  return _transport('/restore', { method: 'POST', body: { name, rev }, token: token() });
}
