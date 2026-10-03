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
const config = require('../../config');

let _cache = null; // { list: [{oa,lat,lng}], loadedAt, count, path }

function parseLatLng(row) {
  // Accept common column spellings from the ONS export. Lat/long preferred; we don't convert easting/northing
  // here (ask for a lat/long export) — a row without usable lat/long is skipped.
  const oa = row.OA21CD || row.oa21cd || row.oa || row.OA || row.code || null;
  const lat = Number(row.lat ?? row.latitude ?? row.y ?? row.LAT ?? row.Latitude);
  const lng = Number(row.long ?? row.lng ?? row.longitude ?? row.x ?? row.LONG ?? row.Longitude);
  if (!oa || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { oa: String(oa), lat, lng };
}

function parseCsvLine(line, headers) {
  const cells = line.split(',');
  const row = {};
  headers.forEach((h, i) => { row[h.trim()] = (cells[i] || '').trim(); });
  return row;
}

/** Load centroids from the configured file (CSV with a header row, or NDJSON). Idempotent + cached. */
async function load({ force = false } = {}) {
  const path = config.neighbourhoodInsights.data.centroidsPath;
  if (!path) return { loaded: false, count: 0, reason: 'no centroids file configured (INSIGHTS_CENTROIDS_PATH)' };
  if (_cache && !force && _cache.path === path) return { loaded: true, count: _cache.count };
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
  _cache = { list, loadedAt: Date.now(), count: list.length, path };
  return { loaded: true, count: list.length };
}

/** The loaded centroid list (empty until load() succeeds). */
function all() { return _cache ? _cache.list : []; }
function isLoaded() { return !!_cache && _cache.count > 0; }
function status() { return { loaded: isLoaded(), count: _cache ? _cache.count : 0, path: config.neighbourhoodInsights.data.centroidsPath || null }; }

// Test seam: inject centroids directly without a file.
function __setForTest(list) { _cache = list ? { list, loadedAt: Date.now(), count: list.length, path: '__test__' } : null; }

module.exports = { load, all, isLoaded, status, parseLatLng, __setForTest };
