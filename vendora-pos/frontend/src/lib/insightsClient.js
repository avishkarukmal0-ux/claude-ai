// Neighbourhood Insights client (optional paid add-on). Talks to the server, which is the only authority on
// access (entitlement) and the only place census data is fetched/combined. The client never computes a
// profile or decides entitlement itself. All calls are authed + owner/manager-gated on the server.
import { currentSession } from './account';
import { INSIGHTS_ENABLED } from './features';

const API_BASE = (() => { try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); } catch { return ''; } })();
const BASE = `${API_BASE}/api/pwa-insights`;

export { INSIGHTS_ENABLED };

async function req(path, { method = 'GET', body } = {}) {
  const s = currentSession();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(s && s.token ? { Authorization: `Bearer ${s.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) { const e = new Error((data && data.message) || `Request failed (${res.status})`); e.status = res.status; e.code = data && data.error && data.error.code; throw e; }
  return data || {};
}
let _t = req;
export function __setInsightsTransport(t) { _t = t || req; }

/** Coverage + what's configured + this shop's entitlement. Resolves a safe default if the add-on is off. */
export async function getStatus() {
  if (!INSIGHTS_ENABLED) return { enabled: false };
  try { return await _t('/status'); }
  catch (e) { return { enabled: false, error: e.message }; }
}

/** Labelled preview of what a buyer receives (structure only, not the owner's area). */
export async function getPreview() { return _t('/preview'); }

/** The real area profile for a postcode + radius (server enforces entitlement; 402 if not entitled). */
export async function getProfile({ postcode, radiusM }) { return _t('/profile', { method: 'POST', body: { postcode, radiusM } }); }
