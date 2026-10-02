'use strict';

// Real neighbourhood data for the store's area. Mounted at /api/pwa-neighbourhood ONLY when
// NEIGHBOURHOOD_ENABLED=true. The browser calls THIS route (never ONS/Nomis/postcodes.io directly) so CORS,
// rate limits, the ONS User-Agent and the secret Nomis UID all stay server-side. Owner/manager only; it is
// NOT the paid add-on and carries no entitlement gate — it's a single real figure for the shop's own area.
const express = require('express');

const router = express.Router();
const pwaAuth = require('../services/pwaAuthService');
const neighbourhood = require('../services/neighbourhoodService');
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

// GET /area?postcode=SW1A1AA[&force=1] → one real figure for the store's area + full provenance + freshness.
router.get('/area', ownerOrManager, async (req, res, next) => {
  try {
    const postcode = (req.query.postcode || '').toString();
    if (!postcode.trim()) throw new AppError('A store postcode is required.', 400, 'NO_POSTCODE');
    const out = await neighbourhood.getAreaProfile(postcode, { force: req.query.force === '1' || req.query.force === 'true' });
    res.json({ success: true, ...out });
  } catch (err) {
    if (err && err.statusCode) return next(new AppError(err.message, err.statusCode, 'NEIGHBOURHOOD'));
    next(err);
  }
});

module.exports = router;
