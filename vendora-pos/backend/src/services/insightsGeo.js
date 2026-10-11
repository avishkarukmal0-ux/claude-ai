'use strict';

// Neighbourhood Insights — the geographic + aggregation METHOD (pure, unit-tested, provider-neutral).
//
// A circular radius never matches census areas, so we use the standard, defensible CENTROID-IN-RADIUS
// (a.k.a. "best-fit") method: an Output Area is included whole when its POPULATION-WEIGHTED CENTROID falls
// within the radius, and the profile is the sum across included OAs. The result is therefore an ESTIMATE of
// the area around the shop, never an exact count — every output is marked `estimated: true` and carries the
// method + the OA count so the UI can say so.
//
// Disclosure control: ONS Census 2021 data is already disclosure-controlled (record swapping + rounding).
// We additionally avoid presenting very small cells at face value — a category count below `MIN_CELL` is
// flagged `suppressed` ("fewer than N") rather than shown as a precise figure. We never invent values.

const EARTH_M = 6371000;
const MIN_CELL = 10; // don't present a category smaller than this as an exact figure

const toRad = (d) => (Number(d) * Math.PI) / 180;

/** Great-circle distance in metres between two {lat, lng} points. */
function haversineMeters(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat); const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Select the Output Areas whose population-weighted centroid is within `radiusM` of `point`.
 * @param centroids [{ oa, lat, lng }]
 * @returns [{ oa, distance }] sorted nearest-first
 */
function selectAreasInRadius(centroids, point, radiusM) {
  const out = [];
  if (!point || point.lat == null || point.lng == null) return out;
  // Cheap bounding-box prefilter: run the (costlier) haversine only on centroids near the point, not all ~190k.
  // The box encloses the circle with a 5% margin, so results are identical — just much faster per request.
  const latMargin = (radiusM / 111320) * 1.05;
  const cosLat = Math.max(0.01, Math.cos(toRad(point.lat)));
  const lngMargin = (radiusM / (111320 * cosLat)) * 1.05;
  for (const c of (centroids || [])) {
    if (!c || c.lat == null || c.lng == null) continue;
    if (Math.abs(c.lat - point.lat) > latMargin || Math.abs(c.lng - point.lng) > lngMargin) continue;
    const d = haversineMeters(point, c);
    if (d <= radiusM) out.push({ oa: c.oa, distance: Math.round(d) });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

/** Merge several { label: count } maps into one summed map. Non-numeric values are ignored. */
function sumCounts(maps) {
  const total = {};
  for (const m of (maps || [])) {
    if (!m) continue;
    for (const [k, v] of Object.entries(m)) {
      const n = Number(v);
      if (Number.isFinite(n)) total[k] = (total[k] || 0) + n;
    }
  }
  return total;
}

/** Turn a { label: count } map into rows with percentages, biggest first, applying small-cell suppression. */
function toRows(map, { total = null, min = MIN_CELL } = {}) {
  const sum = total != null ? total : Object.values(map || {}).reduce((n, v) => n + (Number(v) || 0), 0);
  const rows = Object.entries(map || {}).map(([label, count]) => {
    const c = Number(count) || 0;
    const suppressed = c > 0 && c < min;
    return {
      label,
      count: suppressed ? null : c,            // don't show a precise tiny figure
      suppressed,
      display: suppressed ? `fewer than ${min}` : String(c),
      pct: sum > 0 && !suppressed ? Math.round((c / sum) * 1000) / 10 : null,
    };
  });
  return rows.sort((a, b) => (b.count || 0) - (a.count || 0));
}

/**
 * Combine per-OA profiles selected by the radius into one area profile. Each areaProfile:
 *   { oa, population, households, categories: { ethnicGroup:{..}, language:{..}, age:{..}, household:{..} } }
 * @returns an ESTIMATED aggregate with method metadata. Never an exact count.
 */
function combineAreaProfile(areaProfiles, { radiusM, meta = {} } = {}) {
  const areas = Array.isArray(areaProfiles) ? areaProfiles : [];
  const population = areas.reduce((n, a) => n + (Number(a.population) || 0), 0);
  const households = areas.reduce((n, a) => n + (Number(a.households) || 0), 0);
  const catKeys = new Set();
  for (const a of areas) for (const k of Object.keys(a.categories || {})) catKeys.add(k);
  const categories = {};
  for (const key of catKeys) {
    const summed = sumCounts(areas.map((a) => (a.categories || {})[key]));
    categories[key] = toRows(summed);
  }
  return {
    estimated: true, // a radius never matches census areas — this is always an estimate
    method: 'centroid-in-radius (whole Output Area included when its population-weighted centroid is within the radius)',
    radiusM,
    outputAreas: areas.length,
    population,
    households,
    categories,
    ...meta, // source, referenceYear, coverage, licence, attribution, limitations
    sufficient: areas.length > 0 && population > 0,
  };
}

/**
 * Deprivation (IMD) across a radius. IMD is a per-LSOA RANK/decile, NOT a count, so it can't be summed like the
 * census breakdowns — we take a POPULATION-WEIGHTED AVERAGE of the LSOAs inside the radius. Always an estimate.
 * @param entries [{ population, decile, score? }] one per LSOA in the radius
 * @returns { decile, score|null, lsoaCount } or null when there's nothing to average
 */
function weightedDeprivation(entries) {
  let wPop = 0; let wDecile = 0; let wScore = 0; let haveScore = false; let n = 0;
  for (const e of (entries || [])) {
    const p = Number(e && e.population) || 0;
    const d = Number(e && e.decile);
    if (p <= 0 || !Number.isFinite(d)) continue;
    wPop += p; wDecile += p * d; n += 1;
    const s = Number(e && e.score);
    if (Number.isFinite(s)) { wScore += p * s; haveScore = true; }
  }
  if (wPop <= 0 || n === 0) return null;
  return {
    decile: Math.round(wDecile / wPop),
    score: haveScore ? Math.round((wScore / wPop) * 1000) / 1000 : null,
    lsoaCount: n,
  };
}

module.exports = { haversineMeters, selectAreasInRadius, sumCounts, toRows, combineAreaProfile, weightedDeprivation, MIN_CELL };
