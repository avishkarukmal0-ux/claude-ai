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

router.use(async (req, res, next) => {
  try { req.pwa = pwaAuth.verifyAccess(req.headers.authorization); await pwaAuth.assertMemberActive(req.pwa); next(); }
  catch (err) { next(err); }
});

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

module.exports = router;
