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
    const rows = await model().find({}, { _id: 0, oa: 1, lat: 1, lng: 1 }).lean();
    const list = rows
      .filter((r) => r && r.oa && Number.isFinite(r.lat) && Number.isFinite(r.lng))
      .map((r) => ({ oa: String(r.oa), lat: r.lat, lng: r.lng }));
    _cache = { list, loadedAt: Date.now(), count: list.length, source: 'mongo', path: null };
    return { loaded: list.length > 0, count: list.length, source: 'mongo', reason: list.length ? undefined : 'no centroids imported into MongoDB (run scripts/import-centroids.js)' };
  } catch (e) {
    return { loaded: false, count: 0, reason: `centroids: Mongo read failed (${e.message})` };
  }
}

/**
 * Load centroids ONCE into memory (cached). Prefers a configured file (INSIGHTS_CENTROIDS_PATH, back-compat);
 * otherwise loads from MongoDB. Idempotent — re-reads only on force or a changed source.
 */
async function load({ force = false } = {}) {
  const path = config.neighbourhoodInsights.data.centroidsPath;
  if (_cache && !force) {
    if (path && _cache.source === 'file' && _cache.path === path) return { loaded: _cache.count > 0, count: _cache.count };
    if (!path && _cache.source === 'mongo') return { loaded: _cache.count > 0, count: _cache.count };
  }
  return path ? loadFromFile(path) : loadFromMongo();
}

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
  return { loaded: isLoaded(), count: _cache ? _cache.count : 0, source: _cache ? _cache.source : (path ? 'file' : 'mongo'), path: path || null };
}

// Test seam: inject centroids directly without a file or DB.
function __setForTest(list) { _cache = list ? { list, loadedAt: Date.now(), count: list.length, source: 'test', path: '__test__' } : null; }

module.exports = { load, all, isLoaded, status, count, parseLatLng, __setForTest };
