// Barcode → name/category auto-fill client (scan setup accelerator). Calls OUR backend proxy
// (/api/pwa-lookup), which queries a public product database server-side. Best-effort and honest: it only
// ever returns name/category/brand (never price/cost/stock — those are the shop's own), coverage is patchy
// for tobacco/news/alcohol/vape, and any failure just resolves { found:false } so the shop types it in.
// Requires a signed-in account (the endpoint is token-gated so it isn't an open proxy); guests type manually.
import { currentSession, refresh as refreshSession, ACCOUNTS_ENABLED } from './account';

const API_BASE = (() => {
  try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); }
  catch { return ''; }
})();
const BASE = `${API_BASE}/api/pwa-lookup`;

async function fetchTransport(code, token) {
  const res = await fetch(`${BASE}/${encodeURIComponent(code)}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) { const e = new Error('lookup failed'); e.status = res.status; throw e; }
  return data || { found: false };
}
let _transport = fetchTransport;
/** Inject a transport (tests). Pass nothing to restore real fetch. */
export function __setLookupTransport(t) { _transport = t || fetchTransport; }

function isOffline() { try { return typeof navigator !== 'undefined' && navigator.onLine === false; } catch { return false; } }

/**
 * Look up name/category for a barcode. Never throws; returns { found, name?, category?, brand? }.
 * No-ops (found:false) when accounts are off, offline, not signed in, or the code is too short.
 */
export async function lookupBarcode(barcode) {
  if (!ACCOUNTS_ENABLED || isOffline()) return { found: false };
  const code = String(barcode || '').replace(/\D/g, '');
  if (code.length < 6) return { found: false };
  const s = currentSession();
  if (!s || !s.token) return { found: false };
  try {
    return await _transport(code, s.token);
  } catch (err) {
    if (err && err.status === 401 && s.refreshToken) {
      try { const next = await refreshSession(); return await _transport(code, next && next.token); }
      catch { return { found: false }; }
    }
    return { found: false };
  }
}
