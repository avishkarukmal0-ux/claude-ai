'use strict';

// Neighbourhood Insights — location resolution (postcode/address → point + coverage check).
// Default provider: postcodes.io (open; data under OGL v3.0 — ONS Postcode Directory incl. OS + Royal Mail).
// We only ever resolve a shop's OWN postcode to a map point + its country; we never profile individuals.
//
// Coverage: England & Wales only in v1 (ONS Census 2021). Scotland (NRS 2022) and Northern Ireland
// (NISRA 2021) are SEPARATE censuses/geographies/years — a Scottish/NI postcode is returned as
// `supported: false` with a clear reason, never silently mixed with E&W data.
const config = require('../config');

const BASE = (process.env.POSTCODES_IO_BASE || 'https://api.postcodes.io').replace(/\/+$/, '');
const SUPPORTED_COUNTRIES = new Set(['England', 'Wales']);
const TIMEOUT_MS = 5000;

// Pluggable transport (tests inject a fake; default is a timed fetch of postcodes.io).
async function fetchTransport(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, { signal: controller.signal, headers: { 'User-Agent': 'Vendora-POS/1.0' } });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } finally { clearTimeout(timer); }
}
let _transport = fetchTransport;
function __setTransport(t) { _transport = t || fetchTransport; }

/** Normalise a postcode for the API path (uppercase, no spaces). */
function normalisePostcode(pc) { return String(pc || '').toUpperCase().replace(/\s+/g, ''); }

/** The OA21 code from a postcodes.io result's `codes` object, tolerating field-name variants. */
function oaCodeOf(result) {
  const c = (result && result.codes) || {};
  return c.oa || c.oa21 || c.census_oa || result.oa21 || null;
}

/**
 * Resolve a postcode to a point + coverage. Returns:
 *   { ok:true, supported, country, point:{lat,lng}, oa, lsoa, admin, postcode }  on a valid lookup
 *   { ok:false, reason }                                                          on invalid/not found/error
 * `supported` is false for a valid non-E&W postcode (Scotland/NI) — a real location, just outside v1 coverage.
 */
async function resolvePostcode(postcode) {
  const pc = normalisePostcode(postcode);
  if (pc.length < 5) return { ok: false, reason: 'Enter a full UK postcode.' };
  let res;
  try { res = await _transport(`/postcodes/${encodeURIComponent(pc)}`); }
  catch { return { ok: false, reason: 'Couldn’t reach the postcode service — try again.' }; }
  if (!res || res.status === 404) return { ok: false, reason: 'That postcode wasn’t found.' };
  if (res.status !== 200 || !res.json || !res.json.result) return { ok: false, reason: 'Couldn’t look that postcode up.' };
  const r = res.json.result;
  const country = r.country || null;
  const supported = SUPPORTED_COUNTRIES.has(country);
  return {
    ok: true,
    supported,
    country,
    reason: supported ? null : `${country || 'This area'} isn’t covered yet — Neighbourhood Insights uses ONS Census 2021 (England & Wales). Scotland and Northern Ireland use separate censuses and will be added later.`,
    point: { lat: r.latitude, lng: r.longitude },
    oa: oaCodeOf(r),
    lsoa: (r.codes && r.codes.lsoa) || r.lsoa || null,
    admin: r.admin_district || null,
    postcode: r.postcode || pc,
  };
}

/** Reverse-geocode nearby postcodes for a point (used only if a provider needs OA discovery without centroids). */
async function nearbyPostcodes(point, radiusM, limit = 100) {
  try {
    const res = await _transport(`/postcodes?lon=${point.lng}&lat=${point.lat}&radius=${Math.min(radiusM, 2000)}&limit=${Math.min(limit, 100)}`);
    if (res.status !== 200 || !res.json || !Array.isArray(res.json.result)) return [];
    return res.json.result;
  } catch { return []; }
}

function isLocationConfigured() { return config.neighbourhoodInsights.locationProvider === 'postcodes_io'; }

module.exports = { resolvePostcode, nearbyPostcodes, normalisePostcode, oaCodeOf, isLocationConfigured, SUPPORTED_COUNTRIES, __setTransport };
