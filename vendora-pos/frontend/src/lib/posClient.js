// Till / POS provider catalogue client (sales-import slice 2). Talks to the read-only, secret-free
// /api/pwa-pos endpoint, which is the ONLY authority on what each provider's real status is. The client never
// invents a provider status, never stores credentials, and never connects anything — the only live ingestion
// path today is the manual CSV pilot (handled entirely on-device by salesImportStore). A missing/failed fetch
// degrades to "catalogue unavailable", not to a fake "connected".
import { currentSession } from './account';

const API_BASE = (() => { try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); } catch { return ''; } })();
const BASE = `${API_BASE}/api/pwa-pos`;

async function req(path, { method = 'GET' } = {}) {
  const s = currentSession();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(s && s.token ? { Authorization: `Bearer ${s.token}` } : {}) },
  });
  let data = null; try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const e = new Error((data && data.message) || (data && data.error && data.error.message) || `Request failed (${res.status})`);
    e.status = res.status;
    e.code = data && data.error && (data.error.code || data.error.errorCode);
    throw e;
  }
  return data || {};
}
let _t = req;
export function __setPosTransport(t) { _t = t || req; }

/** The honest provider catalogue + the one live method. Resolves `{ ok:false, error }` instead of throwing so
 *  the screen can fall back to the always-available CSV pilot rather than blanking. */
export async function getProviders() {
  try {
    const out = await _t('/providers');
    return { ok: true, ...out };
  } catch (e) {
    return { ok: false, error: e.message, needsLogin: e.status === 401 };
  }
}

/** This shop's real cloud connections (empty until any exist) + whether the cloud feature is switched on.
 *  Degrades to `{ ok:false }` — it never fabricates a connection. */
export async function getConnections() {
  try {
    const out = await _t('/connections');
    return { ok: true, cloudEnabled: !!out.cloudEnabled, connections: Array.isArray(out.connections) ? out.connections : [] };
  } catch (e) {
    return { ok: false, error: e.message, needsLogin: e.status === 401, cloudEnabled: false, connections: [] };
  }
}

/** Begin (or recover) a cloud connection. Today the server answers an honest "not available yet" (503); we
 *  surface that message rather than pretending a connection started. */
export async function startConnect(providerId) {
  try {
    const out = await _t(`/connect/${encodeURIComponent(providerId)}/start`, { method: 'POST' });
    return { ok: true, ...out };
  } catch (e) {
    return { ok: false, error: e.message, status: e.status, notAvailable: e.status === 503 };
  }
}

// Pure presentation mapping for a shop's per-provider CONNECTION status (distinct from provider availability).
// Kept here so it's unit-testable and the UI never invents a status string.
export function describeConnection(status) {
  switch (status) {
    case 'connected': return { label: 'Connected', tone: 'green' };
    case 'needs_attention': return { label: 'Needs reconnect', tone: 'amber' };
    case 'paused': return { label: 'Paused', tone: 'gray' };
    default: return { label: 'Not connected', tone: 'gray' };
  }
}
