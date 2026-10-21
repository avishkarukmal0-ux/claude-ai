// Till / POS provider catalogue client (sales-import slice 2). Talks to the read-only, secret-free
// /api/pwa-pos endpoint, which is the ONLY authority on what each provider's real status is. The client never
// invents a provider status, never stores credentials, and never connects anything — the only live ingestion
// path today is the manual CSV pilot (handled entirely on-device by salesImportStore). A missing/failed fetch
// degrades to "catalogue unavailable", not to a fake "connected".
import { currentSession } from './account';

const API_BASE = (() => { try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); } catch { return ''; } })();
const BASE = `${API_BASE}/api/pwa-pos`;

async function req(path) {
  const s = currentSession();
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...(s && s.token ? { Authorization: `Bearer ${s.token}` } : {}) },
  });
  let data = null; try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) { const e = new Error((data && data.message) || `Request failed (${res.status})`); e.status = res.status; throw e; }
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
