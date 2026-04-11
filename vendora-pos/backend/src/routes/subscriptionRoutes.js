'use strict';
const express = require('express');
const router = express.Router();
const publicRouter = express.Router();
const { model: Subscription, PLAN_FEATURES } = require('../models/Subscription');
const { requireRole } = require('../middleware/permissions');

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

// Price map — falls back to hardcoded display prices if Stripe not configured
const PRICES = {
  starter: { monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID, annual: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID },
  plus:    { monthly: process.env.STRIPE_PLUS_MONTHLY_PRICE_ID,    annual: process.env.STRIPE_PLUS_ANNUAL_PRICE_ID },
  pro:     { monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,     annual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID },
};

const DISPLAY_PRICES = {
  starter: { monthly: 2900, annual: 2300 },
  plus:    { monthly: 5900, annual: 4700 },
  pro:     { monthly: 9900, annual: 7900 },
};

// ── PUBLIC ROUTER ─────────────────────────────────────────────────────────────

// POST /subscriptions/webhook — Stripe webhook (no auth)
publicRouter.post('/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
  try {
    if (!stripe) {
      return res.json({ received: true });
    }

    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { storeId, plan } = session.metadata || {};
        if (!storeId || !plan) break;

        const stripeSubscriptionId = session.subscription;
        let stripePriceId = null;
        let currentPeriodStart = null;
        let currentPeriodEnd = null;

        if (stripeSubscriptionId) {
          const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          stripePriceId = stripeSub.items.data[0]?.price?.id || null;
          currentPeriodStart = new Date(stripeSub.current_period_start * 1000);
          currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
        }

        const updatedSub = await Subscription.findOneAndUpdate(
          { store: storeId },
          {
            plan,
            status: 'active',
            stripeCustomerId: session.customer,
            stripeSubscriptionId,
            stripePriceId,
            currentPeriodStart,
            currentPeriodEnd,
            cancelAtPeriodEnd: false,
            features: { ...PLAN_FEATURES[plan] },
          },
          { new: true, upsert: true }
        );

        // Emit socket event if io is available globally
        if (global.io) {
          global.io.to(`store:${storeId}`).emit('subscription:upgraded', {
            plan,
            features: updatedSub.features,
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const stripeSub = event.data.object;
        const customer = await stripe.customers.retrieve(stripeSub.customer);
        const storeId = customer.metadata?.storeId;
        if (!storeId) break;

        const status = stripeSub.status === 'active' ? 'active'
          : stripeSub.status === 'past_due' ? 'past_due'
          : stripeSub.status === 'canceled' ? 'cancelled'
          : stripeSub.status;

        await Subscription.findOneAndUpdate(
          { store: storeId },
          {
            status,
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
            currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
            currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
            stripePriceId: stripeSub.items.data[0]?.price?.id || null,
          },
          { new: true }
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object;
        const customer = await stripe.customers.retrieve(stripeSub.customer);
        const storeId = customer.metadata?.storeId;
        if (!storeId) break;

        await Subscription.findOneAndUpdate(
          { store: storeId },
          { status: 'cancelled', cancelAtPeriodEnd: false },
          { new: true }
        );
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customer = await stripe.customers.retrieve(invoice.customer);
        const storeId = customer.metadata?.storeId;
        if (!storeId) break;

        await Subscription.findOneAndUpdate(
          { store: storeId },
          { status: 'past_due' },
          { new: true }
        );
        break;
      }

      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

// ── AUTHENTICATED ROUTER ──────────────────────────────────────────────────────

// GET /subscriptions/current
router.get('/current', async (req, res, next) => {
  try {
    let sub = await Subscription.findOne({ store: req.storeId });
    if (!sub) {
      sub = await Subscription.createTrial(req.storeId);
    }
    const trialDaysLeft = sub.trialEndsAt
      ? Math.max(0, Math.ceil((sub.trialEndsAt - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;
    const trialExpired = sub.status === 'trial' && sub.trialEndsAt && sub.trialEndsAt < new Date();

    // Get live usage counts
    const [staffCount, productCount] = await Promise.all([
      require('../models/Staff').countDocuments({ store: req.storeId, active: true }),
      require('../models/Product').countDocuments({ store: req.storeId, active: true }),
    ]);

    res.json({
      success: true,
      subscription: {
        ...sub.toObject(),
        trialDaysLeft,
        trialExpired,
        usage: {
          staff: staffCount,
          products: productCount,
          tills: 1, // from settings
          stores: 1,
        }
      }
    });
  } catch (err) { next(err); }
});

// POST /subscriptions/create-checkout
router.post('/create-checkout', requireRole('owner'), async (req, res, next) => {
  try {
    const { plan, billing = 'monthly' } = req.body;
    if (!['starter', 'plus', 'pro'].includes(plan)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid plan' } });
    }

    if (!stripe) {
      // Dev mode: return a mock checkout URL
      return res.json({ success: true, checkoutUrl: `/subscription/success?mock=1&plan=${plan}`, mock: true });
    }

    let sub = await Subscription.findOne({ store: req.storeId });

    // Get or create Stripe customer
    let customerId = sub?.stripeCustomerId;
    if (!customerId) {
      const store = await require('../models/Store').findById(req.storeId);
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: store?.name || 'Vendora Store',
        metadata: { storeId: req.storeId.toString() },
      });
      customerId = customer.id;
    }

    const priceId = PRICES[plan][billing];
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/subscription`,
      metadata: { storeId: req.storeId.toString(), plan, billing },
    });

    res.json({ success: true, checkoutUrl: session.url });
  } catch (err) { next(err); }
});

// POST /subscriptions/cancel
router.post('/cancel', requireRole('owner'), async (req, res, next) => {
  try {
    const sub = await Subscription.findOne({ store: req.storeId });
    if (!sub) return res.status(404).json({ success: false, error: { message: 'Subscription not found' } });

    if (stripe && sub.stripeSubscriptionId) {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
    }

    const updated = await Subscription.findOneAndUpdate(
      { store: req.storeId },
      { cancelAtPeriodEnd: true },
      { new: true }
    );

    res.json({ success: true, subscription: updated });
  } catch (err) { next(err); }
});

// POST /subscriptions/reactivate
router.post('/reactivate', requireRole('owner'), async (req, res, next) => {
  try {
    const sub = await Subscription.findOne({ store: req.storeId });
    if (!sub) return res.status(404).json({ success: false, error: { message: 'Subscription not found' } });

    if (stripe && sub.stripeSubscriptionId) {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: false });
    }

    const updated = await Subscription.findOneAndUpdate(
      { store: req.storeId },
      { cancelAtPeriodEnd: false },
      { new: true }
    );

    res.json({ success: true, subscription: updated });
  } catch (err) { next(err); }
});

// POST /subscriptions/billing-portal (alias used by SubscriptionPage.jsx)
router.post('/billing-portal', requireRole('owner'), async (req, res, next) => {
  try {
    if (!stripe) {
      return res.json({ success: true, portalUrl: `/subscription?mock=1`, mock: true });
    }
    const sub = await Subscription.findOne({ store: req.storeId });
    if (!sub || !sub.stripeCustomerId) {
      return res.status(400).json({ success: false, error: { message: 'No billing account found' } });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/subscription`,
    });
    res.json({ success: true, portalUrl: session.url });
  } catch (err) { next(err); }
});

// GET /subscriptions/portal
router.get('/portal', requireRole('owner'), async (req, res, next) => {
  try {
    if (!stripe) {
      return res.json({ success: true, portalUrl: `/subscription?mock=1`, mock: true });
    }

    const sub = await Subscription.findOne({ store: req.storeId });
    if (!sub || !sub.stripeCustomerId) {
      return res.status(400).json({ success: false, error: { message: 'No billing account found' } });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/subscription`,
    });

    res.json({ success: true, portalUrl: session.url });
  } catch (err) { next(err); }
});

module.exports = { router, publicRouter };
