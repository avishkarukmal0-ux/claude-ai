'use strict';

// Census DATA provider: ONS Census 2021 (England & Wales) via the Nomis API, under the Open Government
// Licence v3.0. Implements the interface insightsService expects: fetchAreaProfiles(point, radiusM) → an array
// of per-Output-Area profiles { oa, population, households, categories } that insightsGeo.combineAreaProfile
// then aggregates (with small-cell suppression + the "estimated" labelling).
//
// METHOD
//  1. Select the Output Areas whose population-weighted centroid is within the radius (centroid-in-radius /
//     ONS "best-fit"). Different radii → different OA sets → genuinely different totals.
//  2. For each configured table, fetch the counts for exactly those OAs from Nomis (batched), grouped by the
//     breakdown dimension. population = sum of the age breakdown; households = sum of household composition.
//
// HONESTY / SAFETY
//  - With no centroids file loaded this THROWS, so the service reports configured:false (never fake numbers).
//  - Results are cached (per rounded point + radius) and every request is timeout-bounded.
//  - The dataset ids / dimension names below are DEFAULTS to be confirmed with scripts/verify-insights.js
//    against Nomis for a known location before the numbers are trusted; override via INSIGHTS_NOMIS_TABLES_PATH.
const fs = require('fs');
const NodeCache = require('node-cache');
const config = require('../../config');
const geo = require('../insightsGeo');
const centroids = require('./centroids');

const DATA = () => config.neighbourhoodInsights.data;

// Nomis Census 2021 bulk tables. `dataset` = Nomis dataset id; `dimension` = the breakdown dimension name in
// the API; `measures=20100` is the observation value; geography is passed as explicit OA codes. These are the
// documented starting values — VERIFY with the verify script before relying on the figures.
// `select` constrains the breakdown dimension (empty = request all its categories; we then sum by description
// and drop any "Total" row). These are documented starting values — confirm with the verify script.
const DEFAULT_TABLES = {
  ethnicGroup: { code: 'TS021', dataset: 'NM_2041_1', dimension: 'c2021_eth_20', measures: '20100', select: '' },
  language: { code: 'TS024', dataset: 'NM_2045_1', dimension: 'c2021_lang_8', measures: '20100', select: '' },
  age: { code: 'TS007A', dataset: 'NM_2020_1', dimension: 'c2021_age_6', measures: '20100', select: '' },
  householdComposition: { code: 'TS003', dataset: 'NM_2023_1', dimension: 'c2021_hhcomp_6', measures: '20100', select: '' },
};

function tables() {
  const path = DATA().tablesPath;
  if (path && fs.existsSync(path)) {
    try { return { ...DEFAULT_TABLES, ...JSON.parse(fs.readFileSync(path, 'utf8')) }; } catch { /* fall back */ }
  }
  return DEFAULT_TABLES;
}

const _cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

// Pluggable transport (tests inject a fake). Default: a timeout-bounded fetch returning parsed JSON.
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DATA().fetchTimeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Vendora-POS/1.0 (+insights)' } });
    if (!res.ok) { const e = new Error(`Nomis HTTP ${res.status}`); e.status = res.status; throw e; }
    return await res.json();
  } finally { clearTimeout(timer); }
}
let _transport = fetchJson;
function __setTransport(t) { _transport = t || fetchJson; }

function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

/** Parse a Nomis `.data.json` response into { oaCode: { label: count } } for one table's breakdown dimension. */
function parseObs(json, dimension) {
  const out = {};
  const obs = (json && json.obs) || [];
  for (const o of obs) {
    const oa = o.geography && (o.geography.geogcode || o.geography.code);
    const dim = o[dimension] || o[dimension && dimension.toUpperCase()];
    const label = dim && (dim.description || dim.name);
    const value = o.obs_value && (o.obs_value.value != null ? o.obs_value.value : o.obs_value);
    const n = Number(value);
    if (!oa || !label || !Number.isFinite(n)) continue;
    if (/^total\b/i.test(label) || /: all /i.test(label)) continue; // drop the "Total" row — we want the breakdown
    out[oa] = out[oa] || {};
    out[oa][label] = (out[oa][label] || 0) + n;
  }
  return out;
}

/** Fetch one table's counts for a set of OA codes (batched). → { oaCode: { label: count } }. */
async function fetchTable(def, oaCodes) {
  const merged = {};
  for (const batch of chunk(oaCodes, 150)) {
    const geogParam = encodeURIComponent(batch.join(','));
    const sel = def.select ? `&${def.select}` : '';
    const url = `${DATA().nomisBase}/dataset/${def.dataset}.data.json?geography=${geogParam}&measures=${def.measures}${sel}`;
    const json = await _transport(url);
    const parsed = parseObs(json, def.dimension);
    for (const [oa, counts] of Object.entries(parsed)) {
      merged[oa] = merged[oa] || {};
      for (const [label, n] of Object.entries(counts)) merged[oa][label] = (merged[oa][label] || 0) + n;
    }
  }
  return merged;
}

/**
 * The interface insightsService calls. Returns per-OA profiles for the OAs within the radius; throws when the
 * centroid data isn't loaded (→ service reports configured:false). Cached per rounded point + radius.
 */
async function fetchAreaProfiles(point, radiusM) {
  await centroids.load();
  if (!centroids.isLoaded()) { const e = new Error('OA centroids not loaded'); e.code = 'NO_CENTROIDS'; throw e; }

  const key = `${Number(point.lat).toFixed(4)}:${Number(point.lng).toFixed(4)}:${radiusM}`;
  const cached = _cache.get(key);
  if (cached) return cached;

  const selected = geo.selectAreasInRadius(centroids.all(), point, radiusM);
  if (!selected.length) return [];
  const oaCodes = selected.slice(0, DATA().maxOutputAreas).map((s) => s.oa);

  const T = tables();
  const [eth, lang, age, hh] = await Promise.all([
    fetchTable(T.ethnicGroup, oaCodes),
    fetchTable(T.language, oaCodes),
    fetchTable(T.age, oaCodes),
    fetchTable(T.householdComposition, oaCodes),
  ]);

  const sum = (m) => Object.values(m || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const profiles = oaCodes.map((oa) => {
    const categories = {
      ethnicGroup: eth[oa] || {},
      language: lang[oa] || {},
      age: age[oa] || {},
      householdComposition: hh[oa] || {},
    };
    return {
      oa,
      population: sum(categories.age),                 // residents from the age breakdown
      households: sum(categories.householdComposition), // households from the composition breakdown
      categories,
    };
  });

  _cache.set(key, profiles, DATA().cacheTtlSeconds);
  return profiles;
}

function clearCache() { _cache.flushAll(); }

module.exports = { fetchAreaProfiles, parseObs, fetchTable, tables, DEFAULT_TABLES, clearCache, __setTransport };
