// Real neighbourhood data client. Calls OUR backend (never ONS/Nomis/postcodes.io directly). Keeps the last
// successful response per store postcode in the app's durable store (localStorage + IndexedDB mirror via
// storage.js) so the figure still shows offline, clearly labelled. Never blocks any core/POS screen.
import { readJSON, writeJSON } from './storage';
import { currentSession } from './account';

const API_BASE = (() => { try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); } catch { return ''; } })();
const BASE = `${API_BASE}/api/pwa-neighbourhood`;
const STORE_KEY = 'neighbourhood_v1';      // { [postcode]: { data, fetched_at } } — local-only, workspace-scoped (per shop)
const RADIUS_STORE_KEY = 'neighbourhood_radius_v1'; // { [postcode]: { radiusM, profile, diag, fetched_at } } — last radius result per postcode
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
/** Delete the saved area copy for a postcode (used by "Clear postcode" so clearing really removes the data). */
export function clearStored(postcode) {
  try { const all = readCache(); if (all[norm(postcode)]) { delete all[norm(postcode)]; writeJSON(STORE_KEY, all); } } catch { /* best effort */ }
  // Clearing the postcode must also drop its saved catchment/radius figures — otherwise a cleared postcode could
  // still show stale "Saved <date>" radius numbers offline.
  try { const all = readJSON(RADIUS_STORE_KEY, {}) || {}; if (all[norm(postcode)]) { delete all[norm(postcode)]; writeJSON(RADIUS_STORE_KEY, all); } } catch { /* best effort */ }
}

// Durable per-postcode cache of the LAST radius (catchment) result, so the figures + Slider still show offline —
// clearly labelled "Saved <date>" and read-only (the control is disabled offline). Workspace-scoped like the area
// copy, so it follows the shop, not the device. Only a REAL (configured) result is ever saved.
export function getStoredRadius(postcode) {
  try { const rec = (readJSON(RADIUS_STORE_KEY, {}) || {})[norm(postcode)]; return rec && rec.profile ? rec : null; } catch { return null; }
}
export function putStoredRadius(postcode, { radiusM, profile, diag = null }) {
  try {
    if (!profile) return;
    const all = readJSON(RADIUS_STORE_KEY, {}) || {};
    all[norm(postcode)] = { radiusM: Math.round(radiusM), profile, diag, fetched_at: Date.now() };
    writeJSON(RADIUS_STORE_KEY, all);
  } catch { /* best effort */ }
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

// Last-viewed map tiles are kept in the Cache API (NOT the service worker — the SW deliberately never touches
// /api) so the catchment map still draws the last area the owner looked at when they're offline. Best-effort and
// fully guarded: a missing/disabled Cache API (older browsers, tests) just means no offline tiles, never an error.
// Capped (LRU by insertion order) and expired after a week so stale map imagery is dropped. The cache name is
// exempt from the SW's version purge (see public/sw.js) so bumping the app version doesn't wipe it.
const TILE_CACHE = 'vendora-tiles-v1';
const TILE_MAX = 50;                         // cap — plenty for one area at a couple of zooms, small on disk
const TILE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // a week; map bases change slowly
const STAMP = 'x-tile-cached-at';
async function openTileCache() {
  try { if (typeof caches === 'undefined') return null; return await caches.open(TILE_CACHE); } catch { return null; }
}
async function tileCachePut(url, blob) {
  try {
    const cache = await openTileCache(); if (!cache) return;
    await cache.put(url, new Response(blob, { headers: { [STAMP]: String(Date.now()), 'Content-Type': blob.type || 'image/png' } }));
    const keys = await cache.keys();
    if (keys.length > TILE_MAX) { for (const k of keys.slice(0, keys.length - TILE_MAX)) { try { await cache.delete(k); } catch { /* ignore */ } } }
  } catch { /* best effort — caching a tile must never surface an error */ }
}
async function tileCacheGet(url) {
  try {
    const cache = await openTileCache(); if (!cache) return null;
    const res = await cache.match(url); if (!res) return null;
    const at = Number(res.headers.get(STAMP) || 0);
    if (!at || Date.now() - at > TILE_TTL_MS) { try { await cache.delete(url); } catch { /* ignore */ } return null; }
    return await res.blob();
  } catch { return null; }
}

// Fetch a map tile as a blob URL (authed). On success, cache the bytes for offline; on a network failure, fall
// back to the cached copy if we have a fresh one so the last viewed area still draws. Throws only when the tile
// is neither reachable nor cached — the map layer shows that tile as blank and the card hides the map offline.
export async function fetchTileObjectURL(z, x, y) {
  const url = tileUrl(z, x, y);
  try {
    const res = await _fetch(url, { headers: authHeader() });
    if (!res.ok) throw new Error(`tile ${res.status}`);
    const blob = await res.blob();
    tileCachePut(url, blob); // fire-and-forget; same blob is safe to reuse below
    return URL.createObjectURL(blob);
  } catch (e) {
    const cached = await tileCacheGet(url);
    if (cached) return URL.createObjectURL(cached);
    throw e;
  }
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
    if (res.ok) {
      // Only save REAL figures for offline — never cache a "no figures"/unsupported-nation answer as if it were data.
      if (body && body.available === true) putStored(pc, body);
      return { ...body, ok: true, offline: false };
    }
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
