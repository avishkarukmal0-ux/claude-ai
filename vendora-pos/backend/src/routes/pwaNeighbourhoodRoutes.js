'use strict';

// Real neighbourhood data for the store's area. Mounted at /api/pwa-neighbourhood ONLY when
// NEIGHBOURHOOD_ENABLED=true. The browser calls THIS route (never ONS/Nomis/postcodes.io directly) so CORS,
// rate limits, the ONS User-Agent and the secret Nomis UID all stay server-side. Owner/manager only; it is
// NOT the paid add-on and carries no entitlement gate — it's a single real figure for the shop's own area.
const express = require('express');

const router = express.Router();
const pwaAuth = require('../services/pwaAuthService');
const neighbourhood = require('../services/neighbourhoodService');
const insights = require('../services/insightsService');
const insightsTiles = require('../services/insightsTiles');
const config = require('../config');
const AppError = require('../utils/AppError');

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

// POST /area { postcode: "SW1A1AA", force?: true } → one real figure for the store's area + full provenance +
// freshness. POST (not GET) so the store's postcode travels in the request BODY, never in the URL — keeping it
// out of access logs, proxy logs and browser history. `force` bypasses the server cache (owner/manager only).
router.post('/area', ownerOrManager, async (req, res, next) => {
  try {
    const body = req.body || {};
    const postcode = (body.postcode || '').toString();
    if (!postcode.trim()) throw new AppError('A store postcode is required.', 400, 'NO_POSTCODE');
    const force = body.force === true || body.force === 1 || body.force === '1' || body.force === 'true';
    const out = await neighbourhood.getAreaProfile(postcode, { force });
    res.json({ success: true, ...out });
  } catch (err) {
    if (err && err.statusCode) return next(new AppError(err.message, err.statusCode, 'NEIGHBOURHOOD'));
    next(err);
  }
});

// GET /radius?postcode=&radiusM= → radius-aggregated census figures for the catchment circle, so the numbers on
// the "Your area" card re-sum as the radius changes. This is the PAID Neighbourhood Insights aggregation; here it
// is exposed on the free card ONLY for testing, behind INSIGHTS_TEST_UNLOCK (default off). In production this
// returns 403 and the paid Insights screen (entitlement-gated) is the real home for radius figures. Never
// fabricates: with no centroid data it returns configured:false. Owner/manager only.
router.get('/radius', ownerOrManager, async (req, res, next) => {
  try {
    if (!config.neighbourhoodInsights.testUnlock) {
      throw new AppError('Radius figures are the paid Neighbourhood Insights add-on.', 403, 'INSIGHTS_PAID');
    }
    const postcode = (req.query.postcode || '').toString();
    const radiusM = Number(req.query.radiusM);
    if (!postcode.trim()) throw new AppError('A store postcode is required.', 400, 'NO_POSTCODE');
    // Default: headline only (people + households) → 2 Nomis tables, fast. `full=1` ("Who lives here") returns the
    // full profile with the community breakdowns (country of birth, ethnic group, main language) — fetched only
    // when the owner opens that section, so the headline stays fast.
    const full = req.query.full === '1' || req.query.full === 'true';
    const out = await insights.buildProfile({ postcode, radiusM, headlineOnly: !full });
    if (!out.ok) throw new AppError(out.reason || 'Couldn’t build that profile.', 400, 'RADIUS_FAILED');
    res.json({ success: true, testUnlock: true, ...out });
  } catch (err) {
    if (err && err.statusCode) return next(new AppError(err.message, err.statusCode, err.code || 'RADIUS'));
    next(err);
  }
});

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
