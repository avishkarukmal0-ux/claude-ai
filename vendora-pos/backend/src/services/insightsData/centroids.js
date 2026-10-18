'use strict';

// OA (2021) population-weighted centroid loader for the centroid-in-radius method.
//
// SOURCE (operator downloads once; not bundled — it's ~190k rows of official open data):
//   ONS Open Geography Portal — "Output Areas (December 2021) PWC (V3)" / population-weighted centroids,
//   England & Wales, under the Open Government Licence v3.0. Export as CSV (OA21CD, lat, long — or easting/
//   northing which we accept too) or NDJSON. Point INSIGHTS_CENTROIDS_PATH at that file.
//
// We read it ONCE into memory (a flat array + an index) and reuse it. With no file configured the provider
// reports it isn't set up, so the service shows "not configured" rather than fabricating a profile.
const fs = require('fs');
const readline = require('readline');
const mongoose = require('mongoose');
const config = require('../../config');

let _cache = null; // { list: [{oa,lat,lng}], loadedAt, count, source, path }
// Lazy require so the model isn't resolved at module-load time (avoids any require-order surprises).
let _Model = null;
function model() { _Model = _Model || require('../../models/OaCentroid'); return _Model; }
function dbReady() { try { return mongoose.connection.readyState === 1; } catch { return false; } }

// Convert OSGB36 British National Grid eastings/northings (metres) to WGS84 lat/lng (degrees). The ONS Output
// Area PWC export gives the centres in BNG (x = easting, y = northing), so we convert on import. Standard OS
// reverse-projection + 7-parameter Helmert transform; accurate to a few metres, ample for radius selection.
function osgbToWgs84(E, N) {
  const a = 6377563.396; const b = 6356256.909; const F0 = 0.9996012717; // Airy 1830
  const lat0 = 49 * Math.PI / 180; const lon0 = -2 * Math.PI / 180;
  const N0 = -100000; const E0 = 400000; const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b); const n2 = n * n; const n3 = n * n * n;
  let lat = lat0; let M = 0;
  do {
    lat = (N - N0 - M) / (a * F0) + lat;
    const Ma = (1 + n + 1.25 * n2 + 1.25 * n3) * (lat - lat0);
    const Mb = (3 * n + 3 * n2 + 2.625 * n3) * Math.sin(lat - lat0) * Math.cos(lat + lat0);
    const Mc = (1.875 * n2 + 1.875 * n3) * Math.sin(2 * (lat - lat0)) * Math.cos(2 * (lat + lat0));
    const Md = (35 / 24) * n3 * Math.sin(3 * (lat - lat0)) * Math.cos(3 * (lat + lat0));
    M = b * F0 * (Ma - Mb + Mc - Md);
  } while (Math.abs(N - N0 - M) >= 0.00001);
  const sinLat = Math.sin(lat); const cosLat = Math.cos(lat);
  const nu = a * F0 / Math.sqrt(1 - e2 * sinLat * sinLat);
  const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
  const eta2 = nu / rho - 1;
  const tanLat = Math.tan(lat); const t2 = tanLat * tanLat; const t4 = t2 * t2; const t6 = t4 * t2;
  const sec = 1 / cosLat; const nu3 = nu * nu * nu; const nu5 = nu3 * nu * nu; const nu7 = nu5 * nu * nu;
  const VII = tanLat / (2 * rho * nu);
  const VIII = tanLat / (24 * rho * nu3) * (5 + 3 * t2 + eta2 - 9 * t2 * eta2);
  const IX = tanLat / (720 * rho * nu5) * (61 + 90 * t2 + 45 * t4);
  const X = sec / nu; const XI = sec / (6 * nu3) * (nu / rho + 2 * t2);
  const XII = sec / (120 * nu5) * (5 + 28 * t2 + 24 * t4);
  const XIIA = sec / (5040 * nu7) * (61 + 662 * t2 + 1320 * t4 + 720 * t6);
  const dE = E - E0; const dE2 = dE * dE; const dE3 = dE2 * dE; const dE4 = dE2 * dE2; const dE5 = dE3 * dE2; const dE6 = dE4 * dE2; const dE7 = dE5 * dE2;
  const latA = lat - VII * dE2 + VIII * dE4 - IX * dE6;
  const lonA = lon0 + X * dE - XI * dE3 + XII * dE5 - XIIA * dE7;
  // Airy1830 geodetic -> cartesian
  const eA = 1 - (b * b) / (a * a);
  const v1 = a / Math.sqrt(1 - eA * Math.sin(latA) ** 2);
  const x1 = v1 * Math.cos(latA) * Math.cos(lonA);
  const y1 = v1 * Math.cos(latA) * Math.sin(lonA);
  const z1 = (1 - eA) * v1 * Math.sin(latA);
  // Helmert OSGB36 -> WGS84
  const tx = 446.448; const ty = -125.157; const tz = 542.060; const s = -20.4894e-6;
  const rx = (0.1502 / 3600) * Math.PI / 180; const ry = (0.2470 / 3600) * Math.PI / 180; const rz = (0.8421 / 3600) * Math.PI / 180;
  const x2 = tx + x1 * (1 + s) - y1 * rz + z1 * ry;
  const y2 = ty + x1 * rz + y1 * (1 + s) - z1 * rx;
  const z2 = tz - x1 * ry + y1 * rx + z1 * (1 + s);
  const a2 = 6378137.000; const b2 = 6356752.3142; const e2b = 1 - (b2 * b2) / (a2 * a2);
  const p = Math.sqrt(x2 * x2 + y2 * y2);
  let latW = Math.atan2(z2, p * (1 - e2b)); let prev;
  do { const v2 = a2 / Math.sqrt(1 - e2b * Math.sin(latW) ** 2); prev = latW; latW = Math.atan2(z2 + e2b * v2 * Math.sin(latW), p); } while (Math.abs(latW - prev) > 1e-11);
  return { lat: latW * 180 / Math.PI, lng: Math.atan2(y2, x2) * 180 / Math.PI };
}

// Optional LSOA (2021) code on the row — enables the radius deprivation (IMD) average when present.
function lsoaOf(row) {
  const v = row.LSOA21CD || row.lsoa21cd || row.lsoa21 || row.LSOA21 || row.lsoa || row.LSOA || null;
  return v ? String(v).trim() || null : null;
}

function parseLatLng(row) {
  const oa = row.OA21CD || row.oa21cd || row.oa || row.OA || row.code || null;
  if (!oa) return null;
  const lsoa = lsoaOf(row);
  // 1) Explicit lat/long columns win.
  const lat = Number(row.lat ?? row.latitude ?? row.LAT ?? row.Latitude);
  const lng = Number(row.long ?? row.lng ?? row.longitude ?? row.LONG ?? row.Longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return { oa: String(oa), lat, lng, lsoa };
  }
  // 2) Otherwise x/y: small values are already lat/long (x=lng, y=lat); large values are BNG eastings/northings.
  const x = Number(row.x ?? row.X ?? row.easting ?? row.EASTING ?? row.east ?? row.BNG_E);
  const y = Number(row.y ?? row.Y ?? row.northing ?? row.NORTHING ?? row.north ?? row.BNG_N);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return { oa: String(oa), lat: y, lng: x, lsoa };
  const c = osgbToWgs84(x, y);
  if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return null;
  return { oa: String(oa), lat: c.lat, lng: c.lng, lsoa };
}

function parseCsvLine(line, headers) {
  const cells = line.split(',');
  const row = {};
  headers.forEach((h, i) => { row[h.trim()] = (cells[i] || '').trim(); });
  return row;
}

/** Read centroids from the configured CSV/NDJSON file into memory. */
async function loadFromFile(path) {
  if (!fs.existsSync(path)) return { loaded: false, count: 0, reason: `centroids file not found: ${path}` };
  const list = [];
  const isNdjson = /\.(ndjson|jsonl)$/i.test(path);
  const rl = readline.createInterface({ input: fs.createReadStream(path), crlfDelay: Infinity });
  let headers = null;
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    let parsed = null;
    if (isNdjson) { try { parsed = parseLatLng(JSON.parse(line)); } catch { parsed = null; } }
    else if (!headers) { headers = line.split(',').map((h) => h.trim()); continue; }
    else { parsed = parseLatLng(parseCsvLine(line, headers)); }
    if (parsed) list.push(parsed);
  }
  _cache = { list, loadedAt: Date.now(), count: list.length, source: 'file', path };
  return { loaded: list.length > 0, count: list.length, source: 'file' };
}

/** Read centroids from MongoDB (the OaCentroid collection) into memory. Render's filesystem is ephemeral, so the
 *  Mongo import (scripts/import-centroids.js) is the durable path — same pattern as the IMD import. */
async function loadFromMongo() {
  if (!dbReady()) return { loaded: false, count: 0, reason: 'centroids: database not connected' };
  try {
    const t0 = Date.now();
    // STREAM the ~190k rows with a cursor and build incrementally, instead of buffering every doc and then
    // doing one big synchronous filter/map. Two wins during the ~25–30s warm: (1) peak memory is far lower
    // (no giant intermediate array alongside the list — matters on the 512MB instance), and (2) the event
    // loop stays responsive — we yield every YIELD_EVERY rows, so /healthz, login and sync are never stalled
    // by the warm (cold-start follow-up #4). The warm is already fire-and-forget; this stops its sync spike.
    const YIELD_EVERY = 10000;
    const list = [];
    const cursor = model().find({}, { _id: 0, oa: 1, lat: 1, lng: 1, lsoa: 1 }).lean().batchSize(2000).cursor();
    let sinceYield = 0;
    // eslint-disable-next-line no-restricted-syntax
    for await (const r of cursor) {
      if (r && r.oa && Number.isFinite(r.lat) && Number.isFinite(r.lng)) {
        list.push({ oa: String(r.oa), lat: r.lat, lng: r.lng, lsoa: r.lsoa || null });
      }
      sinceYield += 1;
      if (sinceYield >= YIELD_EVERY) { sinceYield = 0; await new Promise((resolve) => setImmediate(resolve)); }
    }
    _cache = { list, loadedAt: Date.now(), count: list.length, source: 'mongo', path: null, loadMs: Date.now() - t0 };
    return { loaded: list.length > 0, count: list.length, source: 'mongo', reason: list.length ? undefined : 'no centroids imported into MongoDB (run scripts/import-centroids.js)' };
  } catch (e) {
    return { loaded: false, count: 0, reason: `centroids: Mongo read failed (${e.message})` };
  }
}

/**
 * Load centroids ONCE into memory (cached). Prefers a configured file (INSIGHTS_CENTROIDS_PATH, back-compat);
 * otherwise loads from MongoDB. Idempotent — re-reads only on force or a changed source.
 */
let _loading = null; // in-flight load promise — shared so concurrent callers never start a second DB pull
let _loadStartedAt = null; // when the in-flight load began (for a "warming up, retry in N s" estimate)
async function load({ force = false } = {}) {
  const path = config.neighbourhoodInsights.data.centroidsPath;
  if (_cache && !force) {
    if (path && _cache.source === 'file' && _cache.path === path) return { loaded: _cache.count > 0, count: _cache.count };
    if (!path && _cache.source === 'mongo') return { loaded: _cache.count > 0, count: _cache.count };
  }
  // Coalesce concurrent loads: the boot warm-up and any /radius that arrives during the ~25–30s centroid load
  // share ONE promise (and ONE ~190k-row Mongo read) instead of each pulling its own copy. The request simply
  // awaits the load already in progress and then proceeds — no duplicate work, no second connection spike.
  if (_loading && !force) return _loading;
  _loadStartedAt = Date.now();
  _loading = (path ? loadFromFile(path) : loadFromMongo()).finally(() => { _loading = null; });
  return _loading;
}
/** True while the one-time centroid load is in flight (used by /radius to answer "warming up" instead of hanging). */
function isLoading() { return !!_loading; }
/** Milliseconds since the in-flight load began, or null if not loading. */
function loadingElapsedMs() { return _loading && _loadStartedAt ? Date.now() - _loadStartedAt : null; }

/** Fast check of how many centroids exist WITHOUT loading them all into memory (for the status indicator). */
async function count() {
  const path = config.neighbourhoodInsights.data.centroidsPath;
  if (path) return _cache && _cache.source === 'file' ? _cache.count : null; // file: only known after a load
  if (!dbReady()) return null;
  try { return await model().estimatedDocumentCount(); } catch { return null; }
}

/** The loaded centroid list (empty until load() succeeds). */
function all() { return _cache ? _cache.list : []; }
function isLoaded() { return !!_cache && _cache.count > 0; }
function status() {
  const path = config.neighbourhoodInsights.data.centroidsPath;
  return {
    loaded: isLoaded(),
    count: _cache ? _cache.count : 0,
    source: _cache ? _cache.source : (path ? 'file' : 'mongo'),
    path: path || null,
    loadMs: _cache && _cache.loadMs != null ? _cache.loadMs : null, // how long the one-time load took (warm time)
    loadedAt: _cache && _cache.loadedAt ? _cache.loadedAt : null,
  };
}

// Test seam: inject centroids directly without a file or DB.
function __setForTest(list) { _cache = list ? { list, loadedAt: Date.now(), count: list.length, source: 'test', path: '__test__' } : null; }

module.exports = { load, all, isLoaded, isLoading, loadingElapsedMs, status, count, parseLatLng, osgbToWgs84, __setForTest };
