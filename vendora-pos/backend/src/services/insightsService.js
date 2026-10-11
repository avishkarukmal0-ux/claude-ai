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

// The categories we present, each mapped to its ONS Census 2021 bulk table. Used both for the real fetch
// (when a provider is configured) and for the no-data PREVIEW (labels only, never invented values).
const CATEGORIES = [
  { key: 'ethnicGroup', label: 'Ethnic group', table: 'TS021' },
  { key: 'language', label: 'Main language (aged 3+)', table: 'TS024' },
  { key: 'age', label: 'Age band', table: 'TS007A' },
  { key: 'householdComposition', label: 'Household composition', table: 'TS003' },
];

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

  const location = await loc.resolvePostcode(postcode);
  if (!location.ok) return { ok: false, reason: location.reason };
  if (!location.supported) {
    return { ok: true, supported: false, country: location.country, reason: location.reason, ...BASE_META() };
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
  const diag = (provider.lastDiag && provider.lastDiag()) || undefined; // testing aid: OAs that actually got data
  return { ok: true, supported: true, configured: true, location: locOut, profile, ...(diag ? { diag } : {}) };
}

module.exports = { isEnabled, isDataConfigured, isBillingConfigured, status, dataStatus, preview, buildProfile, radii, radiusBounds, CATEGORIES };
