// Client for the server-side email digest prefs (mandate #6). The EMAIL channel's preferences live on the
// account (the server sends it), so they're read/written over the API. Device notifications are separate
// and local (see notifications.js). Pluggable transport for tests.
import { currentSession } from './account';

const API_BASE = (() => {
  try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); }
  catch { return ''; }
})();
const BASE = `${API_BASE}/api/pwa-notify`;

async function fetchTransport(path, { method = 'GET', body } = {}) {
  const s = currentSession();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(s && s.token ? { Authorization: `Bearer ${s.token}` } : {}),
    },
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
export function __setNotifyTransport(t) { _transport = t || fetchTransport; }

export async function getEmailPrefs() { return _transport('/prefs', { method: 'GET' }); }
export async function saveEmailPrefs(prefs) { return _transport('/prefs', { method: 'PUT', body: prefs }); }
export async function getPreview() { return _transport('/preview', { method: 'GET' }); }
