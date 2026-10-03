// Real neighbourhood data client. Calls OUR backend (never ONS/Nomis/postcodes.io directly). Keeps the last
// successful response per store postcode in the app's durable store (localStorage + IndexedDB mirror via
// storage.js) so the figure still shows offline, clearly labelled. Never blocks any core/POS screen.
import { readJSON, writeJSON } from './storage';
import { currentSession } from './account';

const API_BASE = (() => { try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); } catch { return ''; } })();
const BASE = `${API_BASE}/api/pwa-neighbourhood`;
const STORE_KEY = 'neighbourhood_v1';      // { [postcode]: { data, fetched_at } } — local-only (never synced)
const COLD_START_MS = 55000;               // Render free tier can take ~50s to wake; don't hang forever

function norm(pc) { return String(pc || '').toUpperCase().replace(/\s+/g, ''); }
function authHeader() { const s = currentSession(); return s && s.token ? { Authorization: `Bearer ${s.token}` } : {}; }

function readCache() { try { return readJSON(STORE_KEY, {}) || {}; } catch { return {}; } }
export function getStored(postcode) { const rec = readCache()[norm(postcode)]; return rec || null; }
function putStored(postcode, data) {
  try { const all = readCache(); all[norm(postcode)] = { data, fetched_at: Date.now() }; writeJSON(STORE_KEY, all); } catch { /* best effort */ }
}

// Pluggable transport for tests.
let _fetch = (url, opts) => fetch(url, opts);
export function __setFetch(fn) { _fetch = fn || ((url, opts) => fetch(url, opts)); }

/**
 * Get the area figure for a store postcode. Online → fresh data (and caches it); offline / timeout / error →
 * the last stored copy flagged `offline:true`; nothing stored → { available:false, unavailable:true }.
 * Never throws for the "no data" case, so the UI can always render something sensible.
 */
export async function getArea(postcode, { timeoutMs = COLD_START_MS } = {}) {
  const pc = norm(postcode);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await _fetch(`${BASE}/area?postcode=${encodeURIComponent(pc)}`, { headers: authHeader(), signal: controller.signal });
    let body = null; try { body = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) throw Object.assign(new Error((body && body.message) || `Request failed (${res.status})`), { status: res.status });
    putStored(pc, body);
    return { ...body, offline: false };
  } catch (err) {
    const stored = getStored(pc);
    if (stored) return { ...stored.data, offline: true, stored_fetched_at: stored.fetched_at, error: err.message };
    return { available: false, unavailable: true, offline: typeof navigator !== 'undefined' && navigator.onLine === false, error: err.message };
  } finally { clearTimeout(timer); }
}
