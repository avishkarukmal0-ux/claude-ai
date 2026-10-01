'use strict';

// PWA barcode auto-fill (infra: scan → name/category). Mounted at /api/pwa-lookup, always on. Gated by a
// PWA access token so it isn't an open proxy. Thin route → productLookupService. Returns only
// name/category/brand — never anything shop-specific. A miss is a normal 200 { found:false }.
const express = require('express');

const router = express.Router();
const pwaAuth = require('../services/pwaAuthService');
const lookupService = require('../services/productLookupService');

router.use((req, res, next) => {
  try { req.pwa = pwaAuth.verifyAccess(req.headers.authorization); next(); }
  catch (err) { next(err); }
});

// GET /api/pwa-lookup/:barcode → { success, found, name?, category?, brand?, source? }
router.get('/:barcode', async (req, res, next) => {
  try {
    const out = await lookupService.lookup(req.params.barcode);
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

module.exports = router;
