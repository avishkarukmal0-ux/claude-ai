'use strict';

// Neighbourhood Insights routes (optional PAID add-on). Mounted at /api/pwa-insights only when
// INSIGHTS_ENABLED=true (else the whole surface 404s and the core PWA is unaffected). Every route needs a
// PWA token; profiles/exports are OWNER/MANAGER only (area + market intel, like the money screens) AND
// server-enforced behind the paid entitlement. Status + preview are free (so a buyer can see coverage and
// what they'd get before purchase). Thin routes → insightsService + insightsEntitlementService.
const express = require('express');

const router = express.Router();
const pwaAuth = require('../services/pwaAuthService');
const insights = require('../services/insightsService');
const entitlements = require('../services/insightsEntitlementService');
const config = require('../config');
const AppError = require('../utils/AppError');

router.use(async (req, res, next) => {
  try {
    req.pwa = pwaAuth.verifyAccess(req.headers.authorization);
    await pwaAuth.assertMemberActive(req.pwa);
    next();
  } catch (err) { next(err); }
});

// Area/market intelligence is owner/manager only (mirrors FINANCIAL/MONEY screens).
function ownerOrManager(req, res, next) {
  const role = req.pwa && req.pwa.role;
  if (role === 'owner' || role === 'manager' || role == null) return next();
  return next(new AppError('Not allowed for your role.', 403, 'FORBIDDEN_ROLE'));
}

// Whether purchasing is even possible (billing provider configured). Used to tell the buyer honestly.
function purchasingAvailable() { return insights.isBillingConfigured(); }

// GET /status → coverage + what's configured + this shop's entitlement. Free (pre-purchase info).
router.get('/status', ownerOrManager, async (req, res, next) => {
  try {
    const ent = await entitlements.getEntitlement(req.pwa.sub);
    res.json({
      success: true,
      ...insights.status(),
      purchasingAvailable: purchasingAvailable(),
      entitled: entitlements.isActive(ent),
      entitlement: { status: ent.status, currentPeriodEnd: ent.currentPeriodEnd },
    });
  } catch (err) { next(err); }
});

// GET /preview → labelled example of what the report contains (structure only, never the owner's real area).
router.get('/preview', ownerOrManager, (req, res) => {
  res.json({ success: true, ...insights.preview(), purchasingAvailable: purchasingAvailable() });
});

// POST /profile { postcode, radiusM } → the real area profile. Entitlement-ENFORCED on the server.
router.post('/profile', ownerOrManager, async (req, res, next) => {
  try {
    if (!(await entitlements.hasAccess(req.pwa.sub))) {
      throw new AppError(
        purchasingAvailable() ? 'Neighbourhood Insights requires a subscription.' : 'Neighbourhood Insights isn’t available for purchase yet.',
        402, 'INSIGHTS_NOT_ENTITLED',
      );
    }
    const { postcode, radiusM } = req.body || {};
    const out = await insights.buildProfile({ postcode, radiusM });
    if (!out.ok) throw new AppError(out.reason || 'Couldn’t build that profile.', 400, 'INSIGHTS_PROFILE_FAILED');
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

module.exports = router;
