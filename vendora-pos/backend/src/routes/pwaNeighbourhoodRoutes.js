'use strict';

// Real neighbourhood data for the store's area. Mounted at /api/pwa-neighbourhood ONLY when
// NEIGHBOURHOOD_ENABLED=true. The browser calls THIS route (never ONS/Nomis/postcodes.io directly) so CORS,
// rate limits, the ONS User-Agent and the secret Nomis UID all stay server-side. Owner/manager only; it is
// NOT the paid add-on and carries no entitlement gate — it's a single real figure for the shop's own area.
const express = require('express');
const crypto = require('crypto');

const router = express.Router();
const pwaAuth = require('../services/pwaAuthService');
const neighbourhood = require('../services/neighbourhoodService');
const insights = require('../services/insightsService');
const insightsTiles = require('../services/insightsTiles');
const config = require('../config');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

// Threshold (ms) above which a /radius request is logged at WARN so a slow Nomis aggregation stands out in the
// logs. The client aborts at 30s, so anything near that is the stall we're chasing.
const RADIUS_SLOW_MS = 8000;
// Correlate log lines for the same postcode WITHOUT putting the postcode in the logs (privacy): a short,
// non-reversible tag of the normalised postcode.
function pcTag(pc) { try { return crypto.createHash('sha1').update(String(pc || '').toUpperCase().replace(/\s+/g, '')).digest('hex').slice(0, 8); } catch { return '--------'; } }

router.use(async (req, res, next) => {
  try {
    req.pwa = pwaAuth.verifyAccess(req.headers.authorization);
    await pwaAuth.assertMemberActive(req.pwa);
    next();
  } catch (err) { next(err); }
});

function ownerOrManager(req, res, next) {
  const role = req.pwa && req.pwa.role;
  if (role === 'owner' || role === 'manager' || role == null) return next();
  return next(new AppError('Not allowed for your role.', 403, 'FORBIDDEN_ROLE'));
}

// GET /status → what's configured (so the UI can show honest state before asking for a figure).
router.get('/status', ownerOrManager, (req, res) => {
  res.json({
    success: true,
    enabled: neighbourhood.isEnabled(),
    source: config.neighbourhood.source,
    datasetConfigured: !!config.neighbourhood.populationDataset,
    attribution: neighbourhood.OGL,
  });
});

// /area → one real figure for the store's area + full provenance + freshness.
// Mounted on BOTH methods so a client and server deployed out of step still line up:
//   • POST { postcode, force? } — PREFERRED: the postcode travels in the request BODY, so it never lands in
//     access logs, proxy logs or browser history.
//   • GET  ?postcode=&force=1   — legacy fallback for an older client whose POST would 404 on an un-updated
//     server; the client only uses it when POST isn't available.
// Distinct statuses so the UI can tell cases apart: 400 invalid postcode · 404 no data ({error:"no_data"}) ·
// 401 not signed in (auth middleware) · 5xx upstream failure.
async function areaHandler(req, res, next) {
  try {
    const src = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    const postcode = (src.postcode || '').toString();
    if (!postcode.trim()) throw new AppError('A store postcode is required.', 400, 'NO_POSTCODE');
    const force = src.force === true || src.force === 1 || src.force === '1' || src.force === 'true';
    const out = await neighbourhood.getAreaProfile(postcode, { force });
    res.json({ success: true, ...out });
  } catch (err) {
    if (err && err.statusCode) {
      // A genuine "postcode not found" is a 404 — give it a machine-readable body so the UI shows the right
      // "no official figures" message rather than a generic failure.
      if (err.statusCode === 404) return res.status(404).json({ success: false, error: 'no_data', message: err.message });
      return next(new AppError(err.message, err.statusCode, err.code || 'NEIGHBOURHOOD'));
    }
    next(err);
  }
}
router.post('/area', ownerOrManager, areaHandler);
router.get('/area', ownerOrManager, areaHandler);

// /radius → radius-aggregated census figures for the catchment circle, so the numbers on the "Your area" card
// re-sum as the radius changes. This is the PAID Neighbourhood Insights aggregation; exposed on the free card
// ONLY for testing, behind INSIGHTS_TEST_UNLOCK (default off → 403). Never fabricates: no centroid data →
// configured:false. Owner/manager only. Mounted on BOTH methods (POST keeps the postcode in the body, out of
// logs/URLs; GET is the legacy fallback for an out-of-step client).
async function radiusHandler(req, res, next) {
  try {
    if (!config.neighbourhoodInsights.testUnlock) {
      throw new AppError('Radius figures are the paid Neighbourhood Insights add-on.', 403, 'INSIGHTS_PAID');
    }
    const src = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    const postcode = (src.postcode || '').toString();
    const radiusM = Number(src.radiusM);
    if (!postcode.trim()) throw new AppError('A store postcode is required.', 400, 'NO_POSTCODE');
    // Default: headline only (people + households) → 2 Nomis tables, fast. `full=1` ("Who lives here") returns the
    // full profile with the community breakdowns (country of birth, ethnic group, main language) — fetched only
    // when the owner opens that section, so the headline stays fast.
    const full = src.full === '1' || src.full === 'true' || src.full === true || src.full === 1;
    const startedAt = Date.now();
    const out = await insights.buildProfile({ postcode, radiusM, headlineOnly: !full });
    const durationMs = Date.now() - startedAt;
    // One structured line per /radius so a slow aggregation is visible in the Render logs without the postcode.
    // WARN when it crosses the slow threshold (the intermittent cold-OA-fetch stall), INFO otherwise. The diag
    // (OAs found / with census data) tells rate-limiting/latency apart from a dataset/centroid gap.
    const diag = out && out.diag ? out.diag : {};
    const timing = diag.timing || {};
    // Per-Nomis-table summary (dataset, OAs requested, how many came from cache vs were fetched, ms, HTTP status,
    // Retry-After) so a slow cold call shows exactly where the time went and whether Nomis rate-limited us.
    const tables = Array.isArray(timing.tables) ? timing.tables.map((tbl) => ({
      t: tbl.table || null, ds: tbl.dataset || null, req: tbl.oaRequested || 0,
      mem: tbl.oaFromMem || 0, mongo: tbl.oaFromMongo || 0, fetched: tbl.oaFetched || 0,
      persisted: tbl.mongoPersisted != null ? tbl.mongoPersisted : null, // how many we wrote to Mongo this call
      persistErr: tbl.mongoError || null,                                 // a surfaced Mongo write failure, if any
      ms: tbl.ms != null ? tbl.ms : null,
      batchMs: Array.isArray(tbl.batchMs) ? tbl.batchMs : null,           // per-batch wall time (parallel vs serial)
      status: tbl.status != null ? tbl.status : null,
      retryAfter: tbl.retryAfter || null,
    })) : undefined;
    logger.log(durationMs >= RADIUS_SLOW_MS ? 'warn' : 'info', 'pwa-neighbourhood /radius', {
      pc: pcTag(postcode), radiusM: Math.round(radiusM) || null, full,
      durationMs, configured: !!(out && out.configured), supported: !!(out && out.supported),
      outputAreas: (out && out.profile && out.profile.outputAreas) || null,
      oaCount: diag.oaCount != null ? diag.oaCount : null,
      oasWithPopulation: diag.oasWithPopulation != null ? diag.oasWithPopulation : null,
      slow: durationMs >= RADIUS_SLOW_MS,
      // Per-step cold-path breakdown (ms): postcode resolve, centroid load (+ whether already warm), OA select,
      // Nomis total, aggregation — plus the per-table detail above.
      step: {
        resolveMs: timing.resolveMs != null ? timing.resolveMs : null,
        centroidsLoadMs: timing.centroidsLoadMs != null ? timing.centroidsLoadMs : null,
        centroidsWarm: timing.centroidsAlreadyLoaded != null ? timing.centroidsAlreadyLoaded : null,
        centroidCount: timing.centroidCount != null ? timing.centroidCount : null,
        selectMs: timing.selectMs != null ? timing.selectMs : null,
        oaSelected: timing.oaSelected != null ? timing.oaSelected : null,
        nomisTotalMs: timing.nomisTotalMs != null ? timing.nomisTotalMs : null,
        aggregateMs: timing.aggregateMs != null ? timing.aggregateMs : null,
        profileCacheHit: timing.profileCacheHit || null,
      },
      tables,
    });
    if (!out.ok) throw new AppError(out.reason || 'Couldn’t build that profile.', 400, 'RADIUS_FAILED');
    // The `diag` block (OA counts, sample OA code, per-step timing, per-table status) is a server-side diagnostic
    // — it's already in the log above. Don't leak it to clients in production; keep it in the response only in
    // dev or when explicitly opted in (INSIGHTS_DIAG_PUBLIC=true), so the owner's DevTools can still see it.
    const exposeDiag = process.env.NODE_ENV !== 'production' || process.env.INSIGHTS_DIAG_PUBLIC === 'true';
    const body = { success: true, ...out };
    if (!exposeDiag) delete body.diag;
    // Note: no `testUnlock` flag in the response — it's an internal gate (INSIGHTS_TEST_UNLOCK), not client data.
    res.json(body);
  } catch (err) {
    if (err && err.statusCode) return next(new AppError(err.message, err.statusCode, err.code || 'RADIUS'));
    next(err);
  }
}
router.post('/radius', ownerOrManager, radiusHandler);
router.get('/radius', ownerOrManager, radiusHandler);

// GET /tiles/:z/:x/:y.png → OSM map tile for the catchment circle on the "Your area" card. Proxied server-side
// (owner/manager; the browser never calls the tile host directly, so no CSP change). Available with the free
// neighbourhood feature — it does NOT depend on the paid Insights flag. Coordinates validated before any fetch.
router.get('/tiles/:z/:x/:y.png', ownerOrManager, async (req, res, next) => {
  try {
    const { z, x, y } = req.params;
    if (!insightsTiles.isValidTile(z, x, y)) throw new AppError('Invalid tile coordinate.', 400, 'BAD_TILE');
    const tile = await insightsTiles.fetchTile(Number(z), Number(x), Number(y));
    if (tile.status !== 200 || !tile.body || !tile.body.length) throw new AppError('Tile unavailable.', 502, 'TILE_UPSTREAM');
    res.set('Content-Type', tile.contentType || 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(tile.body);
  } catch (err) {
    if (err && err.statusCode) return next(new AppError(err.message, err.statusCode, err.code || 'TILE'));
    next(err);
  }
});

module.exports = router;
