'use strict';

// PWA till-connection catalogue (POS sales import, slice 2). Mounted at /api/pwa-pos, always on.
// READ-ONLY and secret-free: it serves the honest provider availability catalogue so the "Connect your till"
// screen can show each provider's REAL status. It does not connect anything, store credentials, or touch
// stock — the only live ingestion path today is the manual item-level CSV pilot (see salesImportStore on the
// client). Cloud connections are shown truthfully as not-yet-available. Gated by a PWA access token so the
// catalogue isn't an open endpoint; owner/manager or staff may all read it (it reveals nothing shop-specific).
const express = require('express');

const router = express.Router();
const pwaAuth = require('../services/pwaAuthService');
const registry = require('../services/posProviders/registry');
const posCloud = require('../services/posCloudService');
const AppError = require('../utils/AppError');

router.use(async (req, res, next) => {
  try { req.pwa = pwaAuth.verifyAccess(req.headers.authorization); await pwaAuth.assertMemberActive(req.pwa); next(); }
  catch (err) { next(err); }
});

// Enabling or starting a cloud connection is owner/manager only (mirrors the financial/admin role rule). A
// guest/legacy owner token has no role → treated as owner. Staff can read the catalogue but not connect.
function ownerOrManager(req, res, next) {
  const role = req.pwa && req.pwa.role;
  if (role === 'owner' || role === 'manager' || role == null) return next();
  return next(new AppError('Only an owner or manager can connect a till', 403, 'FORBIDDEN'));
}

// Client-facing projection of a catalogue entry. Everything here is public/non-secret; we deliberately keep
// the honest fields (availability, blockers, itemLevelNote) so the screen can be straight with the shopkeeper
// about what does and doesn't work yet, rather than implying a one-tap cloud connection that doesn't exist.
function toClient(p) {
  return {
    id: p.id,
    name: p.name,
    product: p.product,
    availability: p.availability,          // not_configured | approval_required | ready_for_testing | unsupported_setup
    connectionMethods: p.connectionMethods, // e.g. ['cloud','csv'] — 'csv' is the only method live today
    csvCapable: p.connectionMethods.includes('csv'),
    itemLevel: p.itemLevel,
    requiresApproval: !!p.requiresApproval,
    docsUrl: p.docsUrl,
    docsCheckedAt: p.docsCheckedAt,
    itemLevelNote: p.itemLevelNote,
    blockers: p.blockers || [],
  };
}

// GET /api/pwa-pos/providers → the honest catalogue + the one live method flagged.
// { success, docsCheckedAt, liveMethods:['csv'], providers:[...], testable:[ids], csvCapable:[ids] }
router.get('/providers', (req, res, next) => {
  try {
    res.json({
      success: true,
      docsCheckedAt: registry.DOCS_CHECKED,
      // The ONLY ingestion method wired end-to-end today is the manual CSV pilot. Cloud adapters exist as an
      // honest framework (no faked connections) but cannot be connected from here yet — say so plainly.
      liveMethods: ['csv'],
      providers: registry.listProviders().map(toClient),
      testable: registry.testableProviders(),
      csvCapable: registry.csvCapableProviders(),
    });
  } catch (err) { next(err); }
});

// ── Cloud connections (slice 4 scaffolding — inert until a provider is accredited + configured) ──

// GET /api/pwa-pos/connections → this shop's connections (non-secret view). Empty until one exists.
// Also reports whether the cloud feature is switched on, so the client can message honestly.
router.get('/connections', async (req, res, next) => {
  try {
    const out = await posCloud.listConnections(req.pwa.sub);
    res.json({ success: true, cloudEnabled: posCloud.cloudEnabled(), ...out });
  } catch (err) { next(err); }
});

// POST /api/pwa-pos/connect/:provider/start → begin OAuth. Owner/manager only. Returns 503 POS_NOT_AVAILABLE
// with an honest reason until the provider is genuinely configured — never a fabricated authorize URL.
router.post('/connect/:provider/start', ownerOrManager, async (req, res, next) => {
  try {
    const out = await posCloud.startConnect(req.pwa.sub, req.params.provider);
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

// GET /api/pwa-pos/connect/:provider/callback → OAuth redirect target. Owner/manager only. Honest
// "not available" today; when live it verifies state, exchanges the code via the adapter and stores an
// ENCRYPTED token (never plaintext). Never fakes a successful connection.
router.get('/connect/:provider/callback', ownerOrManager, async (req, res, next) => {
  try {
    const out = await posCloud.handleCallback(req.pwa.sub, req.params.provider, { code: req.query.code, state: req.query.state });
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

module.exports = router;
