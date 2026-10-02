'use strict';

// Stripe billing adapter for the PWA (Neighbourhood Insights add-on + the optional Vendora Shop core
// subscription). This is SEPARATE from the deferred till subscription (routes/subscriptionRoutes.js, behind
// TILL_ENABLED): its own webhook endpoint, its own webhook secret, its own prices.
//
// SAFETY RAILS
//  - Inert until INSIGHTS_BILLING_PROVIDER=stripe AND a secret key + the relevant price id are set.
//  - A live (sk_live_) key is REFUSED unless BILLING_ALLOW_LIVE=true — so a test build can never charge live.
//  - Entitlement is NEVER granted from client input or a checkout redirect; only a signature-verified webhook
//    that reflects the real subscription state (with the add-on item present) grants access.
//  - saleMode + whether the census data is configured decide what's purchasable: a recurring Insights charge
//    is only offered when the data is actually delivered; otherwise we fall back to a one-off report or off.
//
// Pure helpers (mapEvent, resolveSaleMode, formatMoney) are unit-tested offline. Network calls (checkout,
// proration preview, add-on cancel) require live Stripe keys and run in the operator's environment.
const config = require('../../config');

const ADDON = () => config.billing.prices.addon;
const CORE = () => config.billing.prices.core;
const ONEOFF = () => config.billing.prices.oneoff;

// --- client -----------------------------------------------------------------
let _client; // memoised Stripe client (or false once we know it can't be built)
let _StripeCtor = null; // injectable for tests
function __setStripeCtor(ctor) { _StripeCtor = ctor; _client = undefined; }

function liveKeyBlocked(key) { return /^sk_live_/.test(String(key || '')) && !config.billing.allowLive; }

/** The Stripe client, or null if billing isn't configured / a live key is blocked. */
function client() {
  if (_client !== undefined) return _client || null;
  const key = config.billing.stripeSecretKey;
  if (config.billing.provider !== 'stripe' || !key || liveKeyBlocked(key)) { _client = false; return null; }
  try {
    const Ctor = _StripeCtor || require('stripe');
    _client = new Ctor(key, { apiVersion: '2024-06-20' });
  } catch { _client = false; }
  return _client || null;
}

function isConfigured() {
  return config.billing.provider === 'stripe' && !!config.billing.stripeSecretKey && !liveKeyBlocked(config.billing.stripeSecretKey);
}

// --- sale mode --------------------------------------------------------------
// Decide what's actually on sale. A 'subscription' sale needs the add-on price AND the census data configured
// (otherwise a recurring charge would be taken for data we aren't delivering → downgrade to a one-off report
// if a one-off price exists, else nothing). A 'one_off' sale needs the one-off price.
function resolveSaleMode({ dataConfigured } = {}) {
  if (!isConfigured()) return 'off';
  const mode = config.billing.saleMode;
  if (mode === 'subscription') {
    if (dataConfigured && ADDON() && CORE()) return 'subscription';
    if (ONEOFF()) return 'one_off'; // honest fallback: sell a single report, not a recurring charge
    return 'off';
  }
  if (mode === 'one_off') return ONEOFF() ? 'one_off' : 'off';
  return 'off';
}

function purchasingAvailable({ dataConfigured } = {}) { return resolveSaleMode({ dataConfigured }) !== 'off'; }

// --- pure event mapping -----------------------------------------------------
// Map a Stripe event to our provider-agnostic normalised event, or null to ignore it. Grants only ever come
// from subscription state that actually contains the add-on item (hasAddon), or a completed one-off payment.
// accountId may be null here (e.g. invoice events) — the DB layer resolves it from customerId.
function mapEvent(event) {
  if (!event || !event.type || !event.data || !event.data.object) return null;
  const obj = event.data.object;
  const createdMs = (event.created ? event.created * 1000 : Date.now());
  const base = { eventId: event.id, eventCreatedMs: createdMs, source: 'stripe' };

  switch (event.type) {
    case 'checkout.session.completed': {
      // One-off report purchase only. Subscription checkouts are granted via customer.subscription.* (which
      // carry the authoritative item list + period), so they're ignored here.
      if (obj.mode !== 'payment') return null;
      const accountId = obj.client_reference_id || (obj.metadata && obj.metadata.accountId) || null;
      return {
        ...base, type: 'purchased', plan: 'one_off', accountId,
        customerId: obj.customer || null, reference: obj.payment_intent || obj.id || null,
        currentPeriodEnd: createdMs + config.billing.reportValidDays * 86400000,
      };
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const items = (obj.items && obj.items.data) || [];
      const addonItem = items.find((i) => i.price && i.price.id === ADDON());
      const hasAddon = !!addonItem;
      const accountId = (obj.metadata && obj.metadata.accountId) || null;
      const common = {
        ...base, plan: 'subscription', accountId, customerId: obj.customer || null,
        reference: obj.id || null, subscriptionId: obj.id || null,
        itemId: addonItem ? addonItem.id : null,
        currentPeriodEnd: obj.current_period_end ? obj.current_period_end * 1000 : null,
        hasAddon,
      };
      const status = obj.status;
      if (status === 'active' || status === 'trialing') {
        // Add-on present → grant/renew Insights. Add-on absent → Insights ends (core subscription continues).
        return hasAddon ? { ...common, type: 'renewed' } : { ...common, type: 'ended' };
      }
      if (status === 'past_due' || status === 'unpaid') return { ...common, type: 'payment_failed' };
      if (status === 'canceled' || status === 'incomplete_expired') return { ...common, type: 'ended' };
      return null; // 'incomplete', 'paused' → no entitlement change
    }
    case 'customer.subscription.deleted': {
      return { ...base, type: 'ended', plan: 'subscription', accountId: (obj.metadata && obj.metadata.accountId) || null, customerId: obj.customer || null, reference: obj.id || null };
    }
    case 'invoice.payment_failed': {
      return { ...base, type: 'payment_failed', customerId: obj.customer || null, reference: obj.subscription || obj.id || null };
    }
    default:
      return null; // invoice.payment_succeeded etc. — renewals are driven by subscription.updated (authoritative)
  }
}

// --- webhook signature (raw body) ------------------------------------------
/** Verify + parse a Stripe webhook from the RAW request body. Throws on a bad/forged signature. */
function constructEvent(rawBody, signatureHeader) {
  const c = client();
  if (!c) { const e = new Error('Billing not configured'); e.statusCode = 503; throw e; }
  const secret = config.billing.stripeWebhookSecret;
  if (!secret) { const e = new Error('Webhook secret not configured'); e.statusCode = 503; throw e; }
  return c.webhooks.constructEvent(rawBody, signatureHeader, secret);
}

// --- checkout / management (network; operator environment) ------------------
const MINOR = (price) => (Number(price) || 0);
function formatMoney(minor, currency = config.billing.currency) {
  const n = (Number(minor) || 0) / 100;
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(n); }
  catch { return `${currency.toUpperCase()} ${n.toFixed(2)}`; }
}

/**
 * Start a purchase. Returns { url } for Stripe Checkout. The add-on and core ride ONE subscription (one
 * invoice, one billing date); a one-off report is a single payment. accountId is stamped into metadata +
 * client_reference_id so the webhook can map back to this shop server-side.
 */
async function createCheckout({ accountId, email, dataConfigured }) {
  const c = client();
  if (!c) { const e = new Error('Purchasing isn’t available yet — no billing provider is configured.'); e.statusCode = 503; throw e; }
  const mode = resolveSaleMode({ dataConfigured });
  if (mode === 'off') { const e = new Error('Purchasing isn’t available yet.'); e.statusCode = 503; throw e; }
  const successUrl = config.billing.successUrl || `${config.frontendUrl}/home?insights=success`;
  const cancelUrl = config.billing.cancelUrl || `${config.frontendUrl}/home?insights=cancel`;

  if (mode === 'one_off') {
    const session = await c.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: ONEOFF(), quantity: 1 }],
      client_reference_id: String(accountId),
      metadata: { accountId: String(accountId), kind: 'insights_report' },
      customer_email: email || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return { url: session.url, mode };
  }

  // subscription: Vendora Shop (core) + Neighbourhood Insights add-on item, one subscription.
  const session = await c.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: CORE(), quantity: 1 }, { price: ADDON(), quantity: 1 }],
    client_reference_id: String(accountId),
    customer_email: email || undefined,
    subscription_data: { metadata: { accountId: String(accountId) } },
    metadata: { accountId: String(accountId) },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  return { url: session.url, mode };
}

/**
 * Preview the prorated charge for ADDING the Insights add-on to an existing core subscription, so it can be
 * shown before the owner confirms. Returns { amount, currency, formatted } or null when not applicable.
 */
async function previewAddonProration({ customerId, subscriptionId }) {
  const c = client();
  if (!c || !customerId || !subscriptionId || !ADDON()) return null;
  const upcoming = await c.invoices.retrieveUpcoming({
    customer: customerId,
    subscription: subscriptionId,
    subscription_items: [{ price: ADDON(), quantity: 1 }],
    subscription_proration_behavior: 'create_prorations',
  });
  const amount = upcoming.amount_due;
  return { amount, currency: upcoming.currency, formatted: formatMoney(amount, upcoming.currency) };
}

/** Cancel ONLY the add-on item, leaving the core subscription in place. */
async function cancelAddon({ subscriptionId, itemId }) {
  const c = client();
  if (!c) { const e = new Error('Billing not configured'); e.statusCode = 503; throw e; }
  if (!itemId) { const e = new Error('No active add-on to cancel.'); e.statusCode = 400; throw e; }
  // Remove just the add-on subscription item; core items remain, so the subscription (and its billing) continues.
  await c.subscriptionItems.del(itemId, { proration_behavior: 'none' });
  return { ok: true, subscriptionId, itemId };
}

module.exports = {
  isConfigured, resolveSaleMode, purchasingAvailable, mapEvent, constructEvent,
  createCheckout, previewAddonProration, cancelAddon, formatMoney,
  __setStripeCtor,
};
