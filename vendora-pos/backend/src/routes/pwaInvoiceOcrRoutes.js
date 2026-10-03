'use strict';

// Optional invoice OCR proxy (Phase 1). Mounted at /api/pwa-invoice-ocr, PWA-token gated. Reports whether
// OCR is configured and, when it is, returns extracted RAW TEXT (never fabricated structured fields).
const express = require('express');

const router = express.Router();
const pwaAuth = require('../services/pwaAuthService');
const ocr = require('../services/invoiceOcrService');

router.use(async (req, res, next) => {
  // Audit follow-up: also assert the member is active so a revoked member can't keep spending paid OCR on a
  // not-yet-expired token — consistent with the protected data routes.
  try { req.pwa = pwaAuth.verifyAccess(req.headers.authorization); await pwaAuth.assertMemberActive(req.pwa); next(); }
  catch (err) { next(err); }
});

// GET /api/pwa-invoice-ocr/status → { success, configured }
router.get('/status', (req, res) => {
  res.json({ success: true, configured: ocr.isConfigured() });
});

// POST /api/pwa-invoice-ocr  { dataUrl } → { success, configured, text? }
router.post('/', async (req, res, next) => {
  try {
    const out = await ocr.extractText((req.body || {}).dataUrl);
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

module.exports = router;
