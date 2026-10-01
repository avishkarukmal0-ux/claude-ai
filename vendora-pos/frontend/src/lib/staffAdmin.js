// Staff administration client (owner only). Talks to /api/pwa-auth/staff with the owner's access token.
// Pluggable transport so the logic is unit-testable without a backend. The backend enforces the owner
// role on every one of these routes — this module is just the typed client.
import { currentSession } from './account';

const API_BASE = (() => {
  try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); }
  catch { return ''; }
})();
const BASE = `${API_BASE}/api/pwa-auth/staff`;

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
export function __setStaffTransport(t) { _transport = t || fetchTransport; }

export async function listStaff() { return (await _transport('', { method: 'GET' })).members || []; }
export async function addStaff({ email, name, role, password }) {
  return (await _transport('', { method: 'POST', body: { email, name, role, password } })).member;
}
export async function updateStaff(id, patch) {
  return (await _transport(`/${id}`, { method: 'PATCH', body: patch })).member;
}
export async function removeStaff(id) { return _transport(`/${id}`, { method: 'DELETE' }); }
