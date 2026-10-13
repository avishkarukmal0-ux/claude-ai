// Real neighbourhood data client. Calls OUR backend (never ONS/Nomis/postcodes.io directly). Keeps the last
// successful response per store postcode in the app's durable store (localStorage + IndexedDB mirror via
// storage.js) so the figure still shows offline, clearly labelled. Never blocks any core/POS screen.
import { readJSON, writeJSON } from './storage';
import { currentSession } from './account';

const API_BASE = (() => { try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); } catch { return ''; } })();
const BASE = `${API_BASE}/api/pwa-neighbourhood`;
const STORE_KEY = 'neighbourhood_v1';      // { [postcode]: { data, fetched_at } } — local-only, workspace-scoped (per shop)
const TIMEOUT_MS = 30000;                   // hard cap: abort after 30s (the UI warns about a cold start at 5s)

function norm(pc) { return String(pc || '').toUpperCase().replace(/\s+/g, ''); }

// Client-side UK postcode check (trimmed, uppercased, space-insensitive) so we never send obvious rubbish and can
// show "check the postcode" before any request. Mirrors the server's acceptance; not a full PAF validation.
const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;
export function isValidUkPostcode(pc) { return UK_POSTCODE_RE.test(norm(pc)); }
function authHeader() { const s = currentSession(); return s && s.token ? { Authorization: `Bearer ${s.token}` } : {}; }

function readCache() { try { return readJSON(STORE_KEY, {}) || {}; } catch { return {}; } }
export function getStored(postcode) { const rec = readCache()[norm(postcode)]; return rec || null; }
function putStored(postcode, data) {
  try { const all = readCache(); all[norm(postcode)] = { data, fetched_at: Date.now() }; writeJSON(STORE_KEY, all); } catch { /* best effort */ }
}

// Pluggable transport for tests.
let _fetch = (url, opts) => fetch(url, opts);
export function __setFetch(fn) { _fetch = fn || ((url, opts) => fetch(url, opts)); }

// Map tiles for the "Your area" catchment circle. Proxied through our backend (/api/pwa-neighbourhood/tiles) so
// the browser never calls the tile host directly (no CSP change) and it works with the free neighbourhood flag —
// no paid Insights dependency. Fetched WITH the bearer header → blob URL (Leaflet <img> can't send headers).
// Radius-aggregated figures for the catchment circle (the paid Insights aggregation). Available on the free card
// only when the server's INSIGHTS_TEST_UNLOCK is on (otherwise 403). Returns the buildProfile shape
// ({ ok, configured, profile, ... }); throws with .status so the caller can hide on 403 (locked/production).
export async function getRadiusProfile({ postcode, radiusM, full = false, signal = null, timeoutMs = TIMEOUT_MS }) {
  const pc = norm(postcode);
  // POST keeps the postcode in the BODY (out of URLs/logs). Own 30s timeout, linked to the caller's signal so a
  // superseded request (new radius/postcode, or unmount) is ABORTED — stops the duplicate overlapping calls and
  // never hangs the UI. Throws AbortError on timeout; the caller maps that to a retryable "couldn't count" state.
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) { if (signal.aborted) controller.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await _fetch(`${BASE}/radius`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ postcode: pc, radiusM: Math.round(radiusM), full: !!full }),
      signal: controller.signal,
    });
    // Deploy-mismatch fallback: a server with only GET /radius 404s the POST — retry once with GET.
    if (res.status === 404) {
      let b = null; try { b = await res.clone().json(); } catch { /* non-JSON 404 = method not found */ }
      if (!(b && b.error === 'no_data')) {
        const qs = `postcode=${encodeURIComponent(pc)}&radiusM=${Math.round(radiusM)}${full ? '&full=1' : ''}`;
        const getRes = await _fetch(`${BASE}/radius?${qs}`, { headers: authHeader(), signal: controller.signal });
        if (getRes.ok || getRes.status !== 404) res = getRes;
      }
    }
    let body = null; try { body = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) { const e = new Error((body && body.message) || `radius ${res.status}`); e.status = res.status; throw e; }
    return body || {};
  } finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); }
}

export function tileUrl(z, x, y) { return `${BASE}/tiles/${z}/${x}/${y}.png`; }
export async function fetchTileObjectURL(z, x, y) {
  const res = await _fetch(tileUrl(z, x, y), { headers: authHeader() });
  if (!res.ok) throw new Error(`tile ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

// One /area request. PREFERRED is POST with the postcode in the BODY (keeps it out of URLs/logs). GET is a
// fallback for a server deployed out of step (one that only has GET /area) so the feature still works there.
function requestArea(pc, force, signal, method) {
  if (method === 'GET') {
    const qs = `postcode=${encodeURIComponent(pc)}${force ? '&force=1' : ''}`;
    return _fetch(`${BASE}/area?${qs}`, { headers: authHeader(), signal });
  }
  return _fetch(`${BASE}/area`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ postcode: pc, force: !!force }),
    signal,
  });
}

/**
 * Get the area figure for a store postcode. Returns a TYPED outcome the UI maps to a distinct message:
 *   success:            { ok:true,  offline:false, ...body }           (body.available + figures)
 *   stored copy shown:  { ok:true,  offline:true,  kind:'offline'|'network', stored_fetched_at, ...storedBody }
 *   invalid postcode:   { ok:false, kind:'invalid' }    (400)
 *   no official data:   { ok:false, kind:'no_data' }    (404 {error:'no_data'})
 *   not signed in:      { ok:false, kind:'auth' }        (401/403)
 *   couldn't reach it:  { ok:false, kind:'network' }     (5xx / timeout / offline with nothing stored)
 * Never throws — the UI always has something sensible to render. Caches a successful body per shop (storage.js
 * is workspace-scoped), so the saved copy follows the shop, not the device.
 */
export async function getArea(postcode, { timeoutMs = TIMEOUT_MS, force = false } = {}) {
  const pc = norm(postcode);
  // Offline: serve the last saved copy (clearly flagged) or an honest "nothing saved".
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const stored = getStored(pc);
    return stored ? { ...stored.data, ok: true, offline: true, kind: 'offline', stored_fetched_at: stored.fetched_at } : { ok: false, kind: 'offline' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await requestArea(pc, force, controller.signal, 'POST');
    // Deploy-mismatch fallback: a server with only GET /area returns a plain 404 for POST (no {error:'no_data'}).
    // Retry once with GET so the feature works until the backend's POST route is deployed.
    if (res.status === 404) {
      let b = null; try { b = await res.clone().json(); } catch { /* non-JSON 404 = method not found */ }
      if (!(b && b.error === 'no_data')) {
        const getRes = await requestArea(pc, force, controller.signal, 'GET');
        if (getRes.ok || getRes.status !== 404) res = getRes;
      }
    }
    let body = null; try { body = await res.json(); } catch { /* non-JSON */ }
    if (res.ok) { putStored(pc, body); return { ...body, ok: true, offline: false }; }
    if (res.status === 400) return { ok: false, kind: 'invalid' };
    if (res.status === 401 || res.status === 403) return { ok: false, kind: 'auth' };
    if (res.status === 404) return { ok: false, kind: 'no_data' };
    // 5xx / unexpected → fall back to a saved copy if we have one, else a network error.
    const stored = getStored(pc);
    return stored ? { ...stored.data, ok: true, offline: true, kind: 'network', stored_fetched_at: stored.fetched_at } : { ok: false, kind: 'network' };
  } catch {
    // Abort (timeout) or a dropped connection → saved copy if any, else a network error with Retry.
    const stored = getStored(pc);
    return stored ? { ...stored.data, ok: true, offline: true, kind: 'network', stored_fetched_at: stored.fetched_at } : { ok: false, kind: 'network' };
  } finally { clearTimeout(timer); }
}
