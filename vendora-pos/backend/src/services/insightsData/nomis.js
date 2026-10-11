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
  // Country of birth (TS004) — the "which countries are people from" breakdown. The dataset id below is a
  // documented STARTING value and is UNVERIFIED: confirm it with scripts/verify-insights.js against Nomis (or
  // override via INSIGHTS_NOMIS_TABLES_PATH) before trusting the numbers. If the id is wrong the fetch is
  // fault-isolated (see fetchAreaProfiles) → this breakdown is simply empty, never wrong, and never breaks the
  // population/household headline or the other breakdowns. The auto-detect parser reads whatever dimension Nomis
  // actually returns, so the dimension hint here need not be exact.
  countryOfBirth: { code: 'TS004', dataset: 'NM_2024_1', dimension: 'c2021_cob_12', measures: '20100', select: '' },
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

// Fields that are never the breakdown dimension when auto-detecting.
const NON_DIMENSION = new Set(['geography', 'obs_value', 'measures', 'time', 'date', 'freq']);

/** Parse a Nomis `.data.json` response into { oaCode: { label: count } } for one table's breakdown dimension.
 *  Prefers the configured dimension name, but FALLS BACK to auto-detecting the varying descriptive dimension —
 *  so a mismatch between the hardcoded dimension id and Nomis's actual field name (the reason figures came back
 *  as 0) no longer loses the data. Mirrors how the free neighbourhood breakdown parser works. */
function parseObs(json, dimension) {
  const out = {};
  const obs = (json && json.obs) || [];
  for (const o of obs) {
    const g = o.geography;
    const oa = g && (g.geogcode || g.code || g.description);
    if (!oa) continue;
    // Prefer the named dimension if it's present on this row; else auto-detect the first non-geography field
    // that carries a `description` (the breakdown category).
    let dim = dimension ? (o[dimension] || o[String(dimension).toUpperCase()]) : null;
    if (!dim || typeof dim.description !== 'string') {
      dim = null;
      for (const [k, v] of Object.entries(o)) {
        if (NON_DIMENSION.has(k)) continue;
        if (v && typeof v === 'object' && typeof v.description === 'string') { dim = v; break; }
      }
    }
    const label = dim && (dim.description || dim.name);
    const value = o.obs_value && (o.obs_value.value != null ? o.obs_value.value : o.obs_value);
    const n = Number(value);
    if (!label || !Number.isFinite(n)) continue;
    if (/^total\b/i.test(label) || /: all /i.test(label)) continue; // drop the "Total" row — we want the breakdown
    out[oa] = out[oa] || {};
    out[oa][label] = (out[oa][label] || 0) + n;
  }
  return out;
}

/** Like fetchTable but never throws — a breakdown whose dataset id is wrong/unverified (or a transient Nomis
 *  error) yields {} instead of failing the whole profile. Used for the non-headline breakdown tables so a bad
 *  Country-of-birth id can't take down population/households or the other breakdowns. */
async function safeFetchTable(def, oaCodes) {
  try { return await fetchTable(def, oaCodes); }
  catch { return {}; }
}

/** Fetch one table's counts for a set of OA codes (batched). → { oaCode: { label: count } }. */
async function fetchTable(def, oaCodes) {
  if (!def || !def.dataset) return {}; // no dataset configured (e.g. an unverified table left unset) → empty, not wrong
  const merged = {};
  // Reuse the server-side Nomis UID (same account as the free neighbourhood feature) when set — some datasets /
  // larger requests need it, and the working feature always sends it.
  const uid = config.neighbourhood && config.neighbourhood.nomisUid ? `&uid=${encodeURIComponent(config.neighbourhood.nomisUid)}` : '';
  for (const batch of chunk(oaCodes, 150)) {
    const geogParam = encodeURIComponent(batch.join(','));
    const sel = def.select ? `&${def.select}` : '';
    const url = `${DATA().nomisBase}/dataset/${def.dataset}.data.json?geography=${geogParam}&measures=${def.measures}${sel}${uid}`;
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
 *
 * `opts.headlineOnly` fetches ONLY the two tables that feed the headline numbers (age → population,
 * household composition → households) and skips ethnic group + language. The free "Your area" card shows only
 * population + households, so this halves the Nomis round-trips (4 tables → 2) and roughly halves first-visit
 * time. Headline results are cached under a separate key so a later FULL request (the paid view, which needs all
 * four breakdowns) never reads back an incomplete profile; a cached FULL result is a superset and satisfies both.
 */
async function fetchAreaProfiles(point, radiusM, opts = {}) {
  const headlineOnly = !!opts.headlineOnly;
  await centroids.load();
  if (!centroids.isLoaded()) { const e = new Error('OA centroids not loaded'); e.code = 'NO_CENTROIDS'; throw e; }

  const base = `${Number(point.lat).toFixed(4)}:${Number(point.lng).toFixed(4)}:${radiusM}`;
  const full = _cache.get(base);                       // a full profile satisfies any request
  if (full) return full;
  if (headlineOnly) { const h = _cache.get(`${base}:h`); if (h) return h; }

  const selected = geo.selectAreasInRadius(centroids.all(), point, radiusM);
  if (!selected.length) return [];
  const oaCodes = selected.slice(0, DATA().maxOutputAreas).map((s) => s.oa);

  const T = tables();
  // Always need age (population) + household composition (households) — these are the headline, fetched strictly
  // (if they fail the service honestly reports configured:false). The breakdowns (ethnic group, main language,
  // country of birth) are only for the full profile and are fetched SAFELY — one bad/unverified table yields {}
  // instead of breaking the headline or the other breakdowns. headlineOnly skips them entirely (free-card speed).
  let eth = {}; let lang = {}; let cob = {};
  const [age, hh] = await Promise.all([
    fetchTable(T.age, oaCodes),
    fetchTable(T.householdComposition, oaCodes),
  ]);
  if (!headlineOnly) {
    [eth, lang, cob] = await Promise.all([
      safeFetchTable(T.ethnicGroup, oaCodes),
      safeFetchTable(T.language, oaCodes),
      safeFetchTable(T.countryOfBirth, oaCodes),
    ]);
  }

  const sum = (m) => Object.values(m || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const profiles = oaCodes.map((oa) => {
    const categories = {
      countryOfBirth: cob[oa] || {},
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

  // Diagnostic (testing): how many OAs actually got census data, and the sample category counts — so when the
  // headline figure is 0 we can tell a query/dataset/geography miss (0 OAs with data) from a parse/sum issue.
  const s0 = oaCodes[0] || null;
  _lastDiag = {
    oaCount: oaCodes.length,
    oasWithPopulation: profiles.filter((p) => p.population > 0).length,
    sampleOa: s0,
    sampleAgeCats: s0 ? Object.keys(age[s0] || {}).length : 0,
    sampleHhCats: s0 ? Object.keys(hh[s0] || {}).length : 0,
  };

  _cache.set(headlineOnly ? `${base}:h` : base, profiles, DATA().cacheTtlSeconds);
  return profiles;
}

let _lastDiag = null;
function lastDiag() { return _lastDiag; }

function clearCache() { _cache.flushAll(); }

module.exports = { fetchAreaProfiles, parseObs, fetchTable, tables, DEFAULT_TABLES, clearCache, lastDiag, __setTransport };
