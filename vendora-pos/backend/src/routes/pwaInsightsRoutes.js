'use strict';

// Neighbourhood Insights routes (optional PAID add-on). Mounted at /api/pwa-insights only when
// INSIGHTS_ENABLED=true (else the whole surface 404s and the core PWA is unaffected). Every route needs a
// PWA token; profiles/exports are OWNER/MANAGER only (area + market intel, like the money screens) AND
// server-enforced behind the paid entitlement. Status + preview are free (so a buyer can see coverage and
// what they'd get before purchase). Thin routes → insightsService + insightsEntitlementService.
const express = require('express');

const router = express.Router();
const crypto = require('crypto');
const pwaAuth = require('../services/pwaAuthService');
const insights = require('../services/insightsService');
const entitlements = require('../services/insightsEntitlementService');
const stripeBilling = require('../services/billing/stripeBilling');
const config = require('../config');
const AppError = require('../utils/AppError');

// Timing-safe compare for the shared-secret webhook.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a || '')); const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch { return false; }
}

// PUBLIC (no PWA token): a provider-AGNOSTIC webhook for a normalised lifecycle event, authenticated with a
// server-held shared secret. Defined BEFORE the auth gate so a server-to-server caller isn't rejected. Unset
// secret → 404 (seam inert). The shop token can NEVER reach this, so a client can't grant itself access.
// Duplicate / out-of-order deliveries are handled by ingestProviderEvent (idempotency ledger + ordering guard).
router.post('/billing/webhook', async (req, res, next) => {
  try {
    const secret = config.neighbourhoodInsights.webhookSecret;
    if (!secret) throw new AppError('Not found', 404, 'NOT_FOUND');
    if (!safeEqual(req.headers['x-insights-signature'] || '', secret)) throw new AppError('Bad signature', 401, 'BAD_SIGNATURE');
    const { type, accountId } = req.body || {};
    if (!accountId || !type) throw new AppError('Bad event', 400, 'BAD_EVENT');
    const out = await entitlements.ingestProviderEvent({ ...req.body, source: req.body.source || 'manual' });
    if (!out.ok) throw new AppError('Could not apply event', 400, 'EVENT_NOT_APPLIED');
    res.json({ success: true, duplicate: !!out.duplicate, skipped: !!out.skipped, status: out.status || null });
  } catch (err) { next(err); }
});

// PUBLIC (no PWA token): the REAL Stripe webhook. Its signature is verified against the RAW request body
// (app.js mounts express.raw for this exact path) using the dedicated INSIGHTS_STRIPE_WEBHOOK_SECRET —
// NOT the till's secret. A forged body fails constructEvent → 400. Entitlement is granted ONLY from here,
// reflecting the real subscription state (add-on item present), never from the checkout redirect.
router.post('/billing/stripe/webhook', async (req, res, next) => {
  try {
    if (!stripeBilling.isConfigured()) throw new AppError('Not found', 404, 'NOT_FOUND');
    let event;
    try { event = stripeBilling.constructEvent(req.body, req.headers['stripe-signature']); }
    catch (e) { throw new AppError(`Webhook signature verification failed: ${e.message}`, 400, 'BAD_SIGNATURE'); }
    const normalised = stripeBilling.mapEvent(event);
    if (!normalised) return res.json({ success: true, ignored: true }); // event we don't act on
    const out = await entitlements.ingestProviderEvent(normalised);
    // Always 200 to Stripe on a handled/ignored event so it doesn't needlessly retry; unresolved is logged.
    res.json({ success: true, duplicate: !!out.duplicate, skipped: !!out.skipped, unresolved: !!out.unresolved, status: out.status || null });
  } catch (err) { next(err); }
});

// Everything below requires a PWA token.
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

// What (if anything) is on sale, honestly: the Stripe adapter resolves this from saleMode AND whether the
// census data is actually configured (a recurring Insights charge is never offered for data we aren't
// delivering — it falls back to a one-off report, or off).
function saleMode() { return stripeBilling.resolveSaleMode({ dataConfigured: insights.isDataConfigured() }); }
function purchasingAvailable() { return saleMode() !== 'off'; }

// GET /status → coverage + what's configured + this shop's entitlement. Free (pre-purchase info).
router.get('/status', ownerOrManager, async (req, res, next) => {
  try {
    const ent = await entitlements.getEntitlement(req.pwa.sub);
    res.json({
      success: true,
      ...insights.status(),
      purchasingAvailable: purchasingAvailable(),
      saleMode: saleMode(),
      entitled: entitlements.isActive(ent),
      entitlement: {
        status: ent.status, plan: ent.plan, currentPeriodEnd: ent.currentPeriodEnd,
        cancelledAt: ent.cancelledAt, hasAddon: !!ent.itemId,
      },
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

// POST /checkout → begin a purchase (Stripe Checkout). Returns { url } to redirect to. Entitlement is NOT
// granted here — only the signature-verified webhook grants it. 503 when nothing is on sale.
router.post('/checkout', ownerOrManager, async (req, res, next) => {
  try {
    if (!purchasingAvailable()) {
      throw new AppError('Purchasing isn’t available yet — billing isn’t configured on this server.', 503, 'BILLING_UNCONFIGURED');
    }
    const email = (req.pwa && req.pwa.email) || undefined;
    const out = await stripeBilling.createCheckout({ accountId: req.pwa.sub, email, dataConfigured: insights.isDataConfigured() });
    res.json({ success: true, url: out.url, mode: out.mode });
  } catch (err) {
    if (err && err.statusCode) return next(new AppError(err.message, err.statusCode, 'BILLING_CHECKOUT'));
    next(err);
  }
});

// POST /billing/preview → the prorated charge for ADDING the add-on to an existing core subscription, so it
// can be shown before the owner confirms. { amount, currency, formatted } or null.
router.post('/billing/preview', ownerOrManager, async (req, res, next) => {
  try {
    const ent = await entitlements.getEntitlement(req.pwa.sub);
    if (!ent.customerId || !ent.subscriptionId) return res.json({ success: true, preview: null, reason: 'No existing subscription to add the add-on to.' });
    const preview = await stripeBilling.previewAddonProration({ customerId: ent.customerId, subscriptionId: ent.subscriptionId });
    res.json({ success: true, preview });
  } catch (err) {
    if (err && err.statusCode) return next(new AppError(err.message, err.statusCode, 'BILLING_PREVIEW'));
    next(err);
  }
});

// POST /billing/cancel-addon → cancel ONLY the Neighbourhood Insights add-on; the core Vendora Shop
// subscription (and its billing) continues. The webhook then updates the entitlement.
router.post('/billing/cancel-addon', ownerOrManager, async (req, res, next) => {
  try {
    const ent = await entitlements.getEntitlement(req.pwa.sub);
    if (!ent.subscriptionId || !ent.itemId) throw new AppError('No active add-on subscription to cancel.', 400, 'NO_ADDON');
    await stripeBilling.cancelAddon({ subscriptionId: ent.subscriptionId, itemId: ent.itemId });
    res.json({ success: true });
  } catch (err) {
    if (err && err.statusCode) return next(new AppError(err.message, err.statusCode, 'BILLING_CANCEL'));
    next(err);
  }
});

module.exports = router;
