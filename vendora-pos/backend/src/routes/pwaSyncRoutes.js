'use strict';

// PWA cross-device sync routes (infra Stage 3). Mounted at /api/pwa-sync, always on (no till dependency,
// ADR-002). Every route requires a valid PWA access token; the token's account id scopes all data, so a
// shop can only ever touch its own blobs. Thin routes → pwaSyncService.
const express = require('express');

const router = express.Router();
const pwaAuth = require('../services/pwaAuthService');
const sync = require('../services/pwaSyncService');

// Gate: require a valid PWA access token, then (for staff/manager tokens) re-check the member is still
// active against the DB so a revoked member's existing token can't keep syncing (Phase 1.4). Owner tokens
// skip the DB check. The decoded payload (with the member's LIVE role) is attached as req.pwa.
router.use(async (req, res, next) => {
  try {
    req.pwa = pwaAuth.verifyAccess(req.headers.authorization);
    await pwaAuth.assertMemberActive(req.pwa);
    next();
  } catch (err) { next(err); }
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

// ── Server-side version history (Phase 1.3; no-op responses when SYNC_HISTORY is off) ──────────────────
// GET /api/pwa-sync/history → { success, enabled, history: { name: [{ rev, mtime, at, kind, size }] } }
router.get('/history', async (req, res, next) => {
  try {
    const out = await sync.listHistory(req.pwa.sub, req.pwa.role);
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

// GET /api/pwa-sync/history/:name/:rev → { success, name, rev, mtime, value, at }
router.get('/history/:name/:rev', async (req, res, next) => {
  try {
    const out = await sync.getHistoryVersion(req.pwa.sub, req.params.name, req.params.rev, req.pwa.role);
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

// POST /api/pwa-sync/restore { name, rev } → restore a store to a prior revision (owner/manager only)
router.post('/restore', async (req, res, next) => {
  try {
    const { name, rev } = req.body || {};
    const out = await sync.restore(req.pwa.sub, name, rev, req.pwa.role);
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

module.exports = router;
