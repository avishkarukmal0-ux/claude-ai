'use strict';

// PWA cross-device sync routes (infra Stage 3). Mounted at /api/pwa-sync, always on (no till dependency,
// ADR-002). Every route requires a valid PWA access token; the token's account id scopes all data, so a
// shop can only ever touch its own blobs. Thin routes → pwaSyncService.
const express = require('express');

const router = express.Router();
const pwaAuth = require('../services/pwaAuthService');
const sync = require('../services/pwaSyncService');

// Gate: require a valid PWA access token and attach the decoded payload.
router.use((req, res, next) => {
  try { req.pwa = pwaAuth.verifyAccess(req.headers.authorization); next(); }
  catch (err) { next(err); }
});

// GET /api/pwa-sync/pull  → { success, blobs: [{ name, value, rev, mtime }] }
// Scoped to the token's shopId; a staff role only receives the stores it's allowed to see.
router.get('/pull', async (req, res, next) => {
  try {
    const out = await sync.pull(req.pwa.sub, req.pwa.role);
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

// POST /api/pwa-sync/push  { changes: [{ name, value, baseRev, mtime }] }
//   → { success, applied: [...], conflicts: [...], rejected: [{ name, reason }] }
// The caller's role decides which stores it may write; forbidden stores come back in `rejected`.
router.post('/push', async (req, res, next) => {
  try {
    const out = await sync.push(req.pwa.sub, (req.body || {}).changes, req.pwa.role);
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

module.exports = router;
