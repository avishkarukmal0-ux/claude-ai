'use strict';

// Neighbourhood Insights — orchestration. Resolves the shop location, selects census Output Areas within the
// radius (centroid-in-radius), pulls Census 2021 counts from the configured DATA provider, and combines them
// into an ESTIMATED aggregate profile (via insightsGeo). Everything is labelled with source/year/coverage/
// method/estimated and the OGL attribution.
//
// HONESTY: the census DATA provider is OFF by default (`INSIGHTS_DATA_PROVIDER` unset). With no provider we
// NEVER fabricate numbers — `buildProfile` returns `configured:false` and the UI says the data isn't set up
// yet, alongside a labelled PREVIEW of the category STRUCTURE (no values). A non-England/Wales postcode is
// returned `supported:false` (Scotland/NI are separate censuses, added later).
const config = require('../config');
const loc = require('./insightsLocation');
const geo = require('./insightsGeo');
const centroids = require('./insightsData/centroids');
const imd = require('./imdService');

// The categories we present, each mapped to its ONS Census 2021 bulk table. Used both for the real fetch
// (when a provider is configured) and for the no-data PREVIEW (labels only, never invented values).
const CATEGORIES = [
  { key: 'countryOfBirth', label: 'Country of birth', table: 'TS004' },
  { key: 'ethnicGroup', label: 'Ethnic group', table: 'TS021' },
  { key: 'language', label: 'Main language (aged 3+)', table: 'TS024' },
  { key: 'economicActivity', label: 'Economic activity', table: 'TS066' },
  { key: 'qualifications', label: 'Qualifications', table: 'TS067' },
  { key: 'age', label: 'Age band', table: 'TS007A' },
  { key: 'householdComposition', label: 'Household composition', table: 'TS003' },
];

// Server-side result cache for buildProfile. The census is static data, so a completed (postcode, radius,
// headline?) computation is reused — the SLOW part is the first-ever fetch of a postcode's output areas from
// Nomis. This makes repeat visits instant AND, crucially, makes a Retry fast: the first request may exceed the
// client's 30s timeout, but Node keeps computing and caches the result, so the user's Retry is a cache hit.
const _resultCache = new Map(); // key -> { at, out }
const RESULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — census doesn't change
const RESULT_MAX = 500;
const normPc = (pc) => String(pc || '').toUpperCase().replace(/\s+/g, '');
const cacheKey = (pc, r, headlineOnly) => `${normPc(pc)}|${r}|${headlineOnly ? 'h' : 'f'}`;
function cacheGet(key) {
  const e = _resultCache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > RESULT_TTL_MS) { _resultCache.delete(key); return null; }
  _resultCache.delete(key); _resultCache.set(key, e); // LRU bump
  return e.out;
}
function cacheSet(key, out) {
  if (_resultCache.size >= RESULT_MAX) { const oldest = _resultCache.keys().next().value; _resultCache.delete(oldest); }
  _resultCache.set(key, { at: Date.now(), out });
}
function __clearResultCache() { _resultCache.clear(); }

const BASE_META = () => ({
  dataSource: config.neighbourhoodInsights.dataSource,          // 'ONS Census 2021'
  referenceYear: config.neighbourhoodInsights.referenceYear,    // 2021
  coverage: config.neighbourhoodInsights.coverage,             // 'England and Wales'
  licence: config.neighbourhoodInsights.licence,              // OGL v3.0
  attribution: config.neighbourhoodInsights.attribution,
  method: 'centroid-in-radius (whole Output Area included when its population-weighted centroid is within the radius)',
});

function isEnabled() { return !!config.neighbourhoodInsights.enabled; }
function isDataConfigured() { return !!config.neighbourhoodInsights.dataProvider; }
function isBillingConfigured() { return !!config.neighbourhoodInsights.billingProvider; }

/** Load the configured census DATA provider module, or null. A provider must export
 *  `fetchAreaProfiles(point, radiusM)` → [{ oa, population, households, categories }] (see docs). */
function dataProvider() {
  const name = config.neighbourhoodInsights.dataProvider;
  if (!name) return null;
  try { return require(`./insightsData/${name}`); } // e.g. ./insightsData/nomis.js (operator-provided/configured)
  catch { return null; }
}

/** Suggested radius presets (metres). */
function radii() { return config.neighbourhoodInsights.radii; }
/** Allowed radius range (metres) — the owner may pick ANY radius in [min, max], not just a preset. */
function radiusBounds() { return { min: config.neighbourhoodInsights.minRadiusM, max: config.neighbourhoodInsights.maxRadiusM }; }

/** Public status — safe to show before purchase; carries coverage + what's configured (no entitlement needed). */
function status() {
  return {
    enabled: isEnabled(),
    dataConfigured: isDataConfigured(),
    billingConfigured: isBillingConfigured(),
    coverage: config.neighbourhoodInsights.coverage,
    dataSource: config.neighbourhoodInsights.dataSource,
    referenceYear: config.neighbourhoodInsights.referenceYear,
    licence: config.neighbourhoodInsights.licence,
    radii: radii(),
    radiusBounds: radiusBounds(),
  };
}

/** Whether the census DATA is actually ready to produce radius figures: a provider is configured AND the OA
 *  centroids are present (counted cheaply, without loading them all into memory). For the owner's status screen. */
async function dataStatus() {
  const provider = config.neighbourhoodInsights.dataProvider || null;
  let centroidCount = null;
  try { centroidCount = await centroids.count(); } catch { centroidCount = null; }
  const ready = !!provider && typeof centroidCount === 'number' && centroidCount > 0;
  return {
    provider,
    centroids: {
      source: config.neighbourhoodInsights.data.centroidsPath ? 'file' : 'mongo',
      count: centroidCount,
      loaded: typeof centroidCount === 'number' ? centroidCount > 0 : null,
    },
    ready, // provider set + centroids present → radius figures will compute
  };
}

/** A labelled PREVIEW of what a buyer receives — category structure only, explicitly NOT the owner's area. */
function preview() {
  return {
    ...BASE_META(),
    note: 'Example of what the report shows — not your area. Buy to see your own postcode.',
    radii: radii(),
    shows: [
      { key: 'population', label: 'Population & household counts (estimated for the radius)' },
      { key: 'households', label: 'Number of households' },
      ...CATEGORIES.map((c) => ({ key: c.key, label: `${c.label} breakdown (ONS ${c.table})` })),
    ],
    limitations: [
      'Figures are ESTIMATES for a circular radius built from whole census Output Areas (centroid-in-radius) — not exact counts.',
      'ONS Census 2021 data is disclosure-controlled (record swapping + cell-key perturbation); small groups are not shown precisely.',
      'Describes nearby RESIDENTS as potential customers — not your actual shoppers, and never proof of demand for any product.',
      'England & Wales only (Census 2021). Scotland and Northern Ireland use separate censuses and are not included.',
    ],
  };
}

/**
 * Build an area profile for a postcode + radius. Never fabricates: with no configured data provider (or an
 * unsupported country / invalid postcode) it returns a clear, honest shape instead of numbers.
 * @returns {{ ok, supported?, configured?, location?, profile?, preview?, reason? , ...meta }}
 */
async function buildProfile({ postcode, radiusM, headlineOnly = false }) {
  const r = Math.round(Number(radiusM));
  const { min, max } = radiusBounds();
  if (!Number.isFinite(r) || r < min || r > max) {
    return { ok: false, reason: `Choose a radius between ${min} and ${max} metres.` };
  }

  // Cache check first — a previously computed (postcode, radius, headline?) result is reused instantly.
  const ck = cacheKey(postcode, r, headlineOnly);
  const cached = cacheGet(ck);
  if (cached) return cached;

  const location = await loc.resolvePostcode(postcode);
  if (!location.ok) return { ok: false, reason: location.reason };
  if (!location.supported) {
    const out = { ok: true, supported: false, country: location.country, reason: location.reason, ...BASE_META() };
    cacheSet(ck, out); // an unsupported nation is a stable answer — cache it so Scotland/NI don't re-resolve
    return out;
  }

  const locOut = { postcode: location.postcode, admin: location.admin, point: location.point, oa: location.oa, radiusM: r };

  const provider = dataProvider();
  if (!isDataConfigured() || !provider || typeof provider.fetchAreaProfiles !== 'function') {
    // Honest: the census data isn't set up on this server. Show what the report WILL contain, not fake numbers.
    return { ok: true, supported: true, configured: false, location: locOut, preview: preview(), reason: 'Neighbourhood data isn’t configured on this server yet.', ...BASE_META() };
  }

  let areas = [];
  // headlineOnly → the provider fetches just population + households (2 tables, not 4). The free "Your area" card
  // shows only those, so it's ~2× faster on the first visit to a radius; the paid view omits it to get all breakdowns.
  try { areas = await provider.fetchAreaProfiles(location.point, r, { headlineOnly }); }
  catch { return { ok: true, supported: true, configured: false, location: locOut, preview: preview(), reason: 'The neighbourhood data provider is unavailable right now.', ...BASE_META() }; }

  const profile = geo.combineAreaProfile(areas, { radiusM: r, meta: BASE_META() });

  // Deprivation (IMD) across the radius — a population-weighted AVERAGE of the LSOAs the radius OAs fall in (IMD
  // is a per-LSOA rank, not a count, so it's averaged, never summed). Needs the OA→LSOA mapping carried on the
  // centroids; if that mapping isn't imported, this is null and the UI keeps the shop's own-area figure. Only on
  // the full profile (the headline free-card path skips it, like the other breakdowns).
  if (!headlineOnly) {
    try { const dep = await radiusDeprivation(areas); if (dep) profile.deprivation = dep; } catch { /* best-effort */ }
  }

  const diag = (provider.lastDiag && provider.lastDiag()) || undefined; // testing aid: OAs that actually got data
  const out = { ok: true, supported: true, configured: true, location: locOut, profile, ...(diag ? { diag } : {}) };
  cacheSet(ck, out); // a real computed profile is static census data — cache it (makes Retry + repeat instant)
  return out;
}

/**
 * Population-weighted average IMD across the radius. Maps each selected OA → its LSOA (via the centroids'
 * optional `lsoa`), sums population per LSOA, looks up each LSOA's IMD, and averages weighted by population.
 * Returns null when the OA→LSOA mapping isn't imported or no IMD is found (→ UI keeps the own-area figure).
 * `imdLookup` is injectable for tests. Exported for unit testing.
 */
async function radiusDeprivation(areas, imdLookup = imd.getFigure) {
  const all = (centroids.all && centroids.all()) || [];
  if (!all.length) return null;
  const oaToLsoa = new Map();
  for (const c of all) { if (c && c.oa && c.lsoa) oaToLsoa.set(String(c.oa), String(c.lsoa)); }
  if (!oaToLsoa.size) return null; // OA→LSOA mapping not imported → skip (honest: keep the shop's own-area figure)

  const popByLsoa = new Map();
  for (const a of (areas || [])) {
    const lsoa = oaToLsoa.get(String(a.oa));
    if (!lsoa) continue;
    popByLsoa.set(lsoa, (popByLsoa.get(lsoa) || 0) + (Number(a.population) || 0));
  }
  if (!popByLsoa.size) return null;

  const entries = [];
  for (const [lsoa, population] of popByLsoa) {
    try { const fig = await imdLookup(lsoa); if (fig && fig.decile != null) entries.push({ population, decile: fig.decile, score: fig.score }); }
    catch { /* skip this LSOA */ }
  }
  const avg = geo.weightedDeprivation(entries);
  if (!avg) return null;
  return {
    estimated: true,
    kind: 'imd',
    label: 'Deprivation (IMD 2025) — radius average',
    method: 'population-weighted average of IMD 2025 across the LSOAs whose areas fall in the radius',
    source: 'English indices of deprivation 2025 (Ministry of Housing, Communities & Local Government)',
    referenceDate: 'IMD 2025 (30 Oct 2025)',
    ...avg, // decile, score, lsoaCount
  };
}

module.exports = { isEnabled, isDataConfigured, isBillingConfigured, status, dataStatus, preview, buildProfile, radiusDeprivation, radii, radiusBounds, CATEGORIES, __clearResultCache };
