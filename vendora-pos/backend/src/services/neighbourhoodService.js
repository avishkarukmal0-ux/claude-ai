'use strict';

// Real neighbourhood data for a store's area. Flow: store postcode → postcodes.io (area codes) → ONS Beta API
// or Nomis (one real Census 2021 figure) → cached in MongoDB with full provenance. The BROWSER never calls the
// upstreams; only this service does (CORS, rate limits, the ONS User-Agent, and the secret Nomis UID).
//
// Guarantees: never invents numbers. If an upstream fails or no dataset is configured, we return a clear
// "unavailable" (or a labelled stale copy) — never a placeholder. Rate limits are respected (429 → Retry-After),
// requests are concurrency-limited and timeout-bounded (Render cold start can be ~50s).
//
// The pure helpers (normalisePostcode, parseRetryAfter, decideRefresh, freshnessOf, shapeResponse) are
// unit-tested offline. The network functions require outbound access and run on the server (Render), not in CI.
const config = require('../config');
const NeighbourhoodArea = require('../models/NeighbourhoodArea');

const C = () => config.neighbourhood;
const OGL = 'Source: Office for National Statistics licensed under the Open Government Licence v3.0';

// ── pure helpers ────────────────────────────────────────────────────────────
function normalisePostcode(pc) { return String(pc || '').toUpperCase().replace(/\s+/g, ''); }

// For a COUNT table (e.g. TS001) Nomis returns a "Total" row AND its breakdown components, with
// Total = Σ components — so summing every row double-counts. Pick the row the source labels "Total"; if none
// is labelled, fall back to the max value (which equals the total for a count table). We NEVER sum here.
function pickTotalCount(obs) {
  let total = null; let max = null;
  for (const o of (obs || [])) {
    const v = Number(o.obs_value && (o.obs_value.value != null ? o.obs_value.value : o.obs_value));
    if (!Number.isFinite(v)) continue;
    max = max == null ? v : Math.max(max, v);
    const isTotalRow = Object.values(o).some((d) => d && typeof d === 'object' && typeof d.description === 'string' && /^total\b/i.test(d.description));
    if (isTotalRow) total = v;
  }
  return total != null ? total : max;
}
function isValidPostcode(pc) { return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(normalisePostcode(pc)); }

/** Parse a Retry-After header (delta-seconds or HTTP-date) into a delay in ms (clamped). */
function parseRetryAfter(header, now = Date.now()) {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, Math.min(secs, 120)) * 1000;
  const when = Date.parse(header);
  if (Number.isFinite(when)) return Math.max(0, Math.min(when - now, 120000));
  return null;
}

/** Should we re-fetch this cached record? Older than the TTL, or the dataset's last_updated is newer. */
function decideRefresh(record, { ttlHours = C().ttlHours, now = Date.now(), datasetLastUpdated = null } = {}) {
  if (!record || !record.fetchedAt) return true;
  const ageMs = now - new Date(record.fetchedAt).getTime();
  if (ageMs > ttlHours * 3600 * 1000) return true;
  if (datasetLastUpdated) {
    const known = record.figures && record.figures[0] && record.figures[0].lastUpdated;
    if (known && Date.parse(datasetLastUpdated) > Date.parse(known)) return true;
  }
  return false;
}

/** Freshness label for a cached record: 'fresh' | 'stale' | 'out_of_date'. */
function freshnessOf(record, { now = Date.now(), ttlHours = C().ttlHours, staleMaxDays = C().staleMaxDays } = {}) {
  if (!record || !record.fetchedAt) return 'out_of_date';
  const ageMs = now - new Date(record.fetchedAt).getTime();
  if (ageMs > staleMaxDays * 86400000) return 'out_of_date';
  if (ageMs > ttlHours * 3600000) return 'stale';
  return 'fresh';
}

/** Shape the API/stored record into the response the PWA consumes. */
function shapeResponse(record, { online = true, now = Date.now() } = {}) {
  if (!record) return { available: false, reason: 'No data for this area yet.' };
  return {
    available: (record.figures || []).length > 0,
    postcode: record.postcode,
    area: { lsoa21: record.lsoa21, msoa21: record.msoa21, ward: record.ward, district: record.district, country: record.country },
    figures: (record.figures || []).map((f) => ({
      key: f.key, label: f.label, value: f.value, unit: f.unit,
      geography: f.geography, geographyCode: f.geographyCode,
      source: f.source, datasetId: f.datasetId, edition: f.edition, version: f.version,
      referenceDate: f.referenceDate, lastUpdated: f.lastUpdated, fetchedAt: f.fetchedAt,
      attribution: f.attribution || OGL,
    })),
    fetchedAt: record.fetchedAt,
    freshness: freshnessOf(record, { now }),
    online,
    attribution: OGL,
  };
}

// ── concurrency limiter (tiny, no deps) ──────────────────────────────────────
let _active = 0; const _queue = [];
function withLimit(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      _active += 1;
      Promise.resolve().then(fn).then(
        (v) => { _active -= 1; if (_queue.length) _queue.shift()(); resolve(v); },
        (e) => { _active -= 1; if (_queue.length) _queue.shift()(); reject(e); },
      );
    };
    if (_active < C().maxConcurrent) run(); else _queue.push(run);
  });
}

// ── network layer (pluggable transport for tests) ────────────────────────────
async function defaultTransport(url, { headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), C().timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': C().userAgent, ...headers } });
    let body = null;
    const text = await res.text();
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: res.status, headers: { 'retry-after': res.headers.get('retry-after') }, body };
  } finally { clearTimeout(timer); }
}
let _transport = defaultTransport;
function __setTransport(t) { _transport = t || defaultTransport; }

/** GET with one Retry-After-aware retry on 429, under the concurrency limit. */
async function getJson(url, { headers = {}, now = Date.now } = {}) {
  return withLimit(async () => {
    let res = await _transport(url, { headers });
    if (res.status === 429) {
      const delay = parseRetryAfter(res.headers && res.headers['retry-after'], now()) ?? 2000;
      await new Promise((r) => setTimeout(r, delay));
      res = await _transport(url, { headers });
    }
    return res;
  });
}

/** postcode → area codes (lsoa21, msoa21, ward, district, country). Throws on not found / upstream error. */
async function resolvePostcode(postcode) {
  const pc = normalisePostcode(postcode);
  if (!isValidPostcode(pc)) { const e = new Error('Enter a valid UK postcode.'); e.statusCode = 400; throw e; }
  const res = await getJson(`${C().postcodesBase}/postcodes/${encodeURIComponent(pc)}`);
  if (res.status === 404) { const e = new Error('That postcode wasn’t found.'); e.statusCode = 404; throw e; }
  if (res.status !== 200 || !res.body || !res.body.result) { const e = new Error('Couldn’t reach the postcode service.'); e.statusCode = 502; throw e; }
  const r = res.body.result;
  const codes = r.codes || {};
  return {
    postcode: r.postcode ? r.postcode.toUpperCase().replace(/\s+/g, '') : pc,
    lsoa21: codes.lsoa || r.lsoa || null,
    msoa21: codes.msoa || r.msoa || null,
    ward: r.admin_ward || null,
    wardCode: codes.admin_ward || null,
    district: r.admin_district || null,
    country: r.country || null,
  };
}

/** Fetch ONE real population figure for an LSOA from Nomis. Requires a configured dataset id. */
async function fetchPopulationNomis(area) {
  const dataset = C().populationDataset;
  if (!dataset) return null; // we do NOT guess a dataset id
  const uid = C().nomisUid ? `&uid=${encodeURIComponent(C().nomisUid)}` : '';
  const url = `${C().nomisBase}/dataset/${dataset}.data.json?geography=${encodeURIComponent(area.lsoa21)}&measures=20100${uid}`;
  const res = await getJson(url);
  if (res.status !== 200 || !res.body || !Array.isArray(res.body.obs)) return null;
  const value = pickTotalCount(res.body.obs);
  if (value == null) return null;
  return {
    key: 'population', label: 'Usual residents', value, unit: 'people',
    geography: 'lsoa21', geographyCode: area.lsoa21,
    source: 'Nomis', datasetId: dataset, edition: null, version: null,
    referenceDate: 'Census 2021', lastUpdated: null, attribution: OGL,
  };
}

/** Fetch ONE real population figure from the ONS Beta API. Requires a configured dataset id; discovers the
 *  latest edition/version + last_updated. The exact observation query is dataset-specific — if the response
 *  can't be parsed into a clean number we return null (never a guess). */
async function fetchPopulationOns(area) {
  const dataset = C().populationDataset;
  if (!dataset) return null;
  const meta = await getJson(`${C().onsBase}/datasets/${encodeURIComponent(dataset)}`);
  if (meta.status !== 200 || !meta.body) return null;
  const lastUpdated = meta.body.last_updated || null;
  const links = meta.body.links || {};
  const latestVersionHref = links.latest_version && links.latest_version.href;
  if (!latestVersionHref) return null;
  // The latest version carries the observation endpoint + dimensions; a geography-filtered observation gives
  // the value for this LSOA. Dimension names vary by dataset, so we read the value defensively.
  const obs = await getJson(`${latestVersionHref}/observations?geography=${encodeURIComponent(area.lsoa21)}`);
  if (obs.status !== 200 || !obs.body) return null;
  const list = obs.body.observations || (Array.isArray(obs.body) ? obs.body : null);
  if (!Array.isArray(list) || !list.length) return null;
  const raw = list[0].observation != null ? list[0].observation : list[0].value;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return {
    key: 'population', label: 'Usual residents', value, unit: 'people',
    geography: 'lsoa21', geographyCode: area.lsoa21,
    source: 'ONS', datasetId: dataset,
    edition: (links.latest_version && links.latest_version.id) || null,
    version: latestVersionHref.split('/').pop() || null,
    referenceDate: 'Census 2021', lastUpdated, attribution: OGL,
  };
}

async function fetchPopulation(area) {
  return C().source === 'nomis' ? fetchPopulationNomis(area) : fetchPopulationOns(area);
}

/**
 * Get the area profile for a store postcode. Returns a SHAPED response (never throws for "no data"):
 * serves a fresh cache, re-fetches when stale/forced, and on upstream failure falls back to the labelled
 * stale copy or an honest "unavailable". Never fabricates.
 */
async function getAreaProfile(postcode, { force = false, now = Date.now() } = {}) {
  const pc = normalisePostcode(postcode);
  if (!isValidPostcode(pc)) { const e = new Error('Enter a valid UK postcode.'); e.statusCode = 400; throw e; }

  const existing = await NeighbourhoodArea.findOne({ postcode: pc }).lean();
  if (existing && !force && !decideRefresh(existing, { now })) {
    return shapeResponse(existing, { online: true, now });
  }

  try {
    const area = await resolvePostcode(pc);
    const figure = await fetchPopulation(area);
    if (!figure) {
      // Upstream reachable but no usable figure (e.g. dataset not configured). Don't invent — serve stale if any.
      if (existing) return { ...shapeResponse(existing, { online: true, now }), note: 'Showing last known data; a fresh figure isn’t available yet.' };
      return { available: false, reason: C().populationDataset ? 'No figure available for this area yet.' : 'Neighbourhood data isn’t fully configured on the server yet.', area, attribution: OGL };
    }
    figure.fetchedAt = new Date(now);
    const doc = await NeighbourhoodArea.findOneAndUpdate(
      { postcode: pc },
      { postcode: pc, lsoa21: area.lsoa21, msoa21: area.msoa21, ward: area.ward, district: area.district, country: area.country, figures: [figure], fetchedAt: new Date(now) },
      { upsert: true, new: true },
    ).lean();
    return shapeResponse(doc, { online: true, now });
  } catch (err) {
    if (existing) {
      return { ...shapeResponse(existing, { online: true, now }), note: `Couldn’t refresh (${err.message}); showing last known data.` };
    }
    const e = new Error(err.message || 'Neighbourhood data is unavailable right now.');
    e.statusCode = err.statusCode || 502;
    throw e;
  }
}

function isEnabled() { return !!C().enabled; }

module.exports = {
  isEnabled, getAreaProfile, resolvePostcode, fetchPopulation, fetchPopulationOns, fetchPopulationNomis,
  normalisePostcode, isValidPostcode, parseRetryAfter, decideRefresh, freshnessOf, shapeResponse, pickTotalCount, OGL,
  __setTransport,
};
