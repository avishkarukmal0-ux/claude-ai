'use strict';

// Stripe billing adapter — DB-FREE, offline-verifiable:
//  - webhook signature verification against the RAW body (real HMAC via the stripe lib; forged body rejected)
//  - pure Stripe-event → normalised-event mapping (grants only when the add-on item is actually present)
//  - sale-mode resolution (recurring Insights only when the census data is configured; else one-off / off)
//  - idempotency + out-of-order ingest decision (pure)
// No network is used: webhooks.constructEvent / generateTestHeaderString are local crypto.

// Configure billing BEFORE requiring config (it reads env once).
process.env.INSIGHTS_BILLING_PROVIDER = 'stripe';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummydummydummy';
process.env.INSIGHTS_STRIPE_WEBHOOK_SECRET = 'whsec_testsecret';
process.env.INSIGHTS_STRIPE_PRICE_CORE = 'price_core';
process.env.INSIGHTS_STRIPE_PRICE_ADDON = 'price_addon';
process.env.INSIGHTS_STRIPE_PRICE_ONEOFF = 'price_oneoff';
process.env.INSIGHTS_SALE_MODE = 'subscription';

const stripeBilling = require('../services/billing/stripeBilling');
const ent = require('../services/insightsEntitlementService');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
const SECRET = process.env.INSIGHTS_STRIPE_WEBHOOK_SECRET;

function signed(eventObj) {
  const payload = JSON.stringify(eventObj);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return { payload: Buffer.from(payload), header };
}

describe('stripeBilling.constructEvent — raw-body signature verification', () => {
  const evt = { id: 'evt_1', type: 'customer.subscription.updated', created: 1700000000, data: { object: { id: 'sub_1' } } };

  test('accepts a correctly signed raw body', () => {
    const { payload, header } = signed(evt);
    const out = stripeBilling.constructEvent(payload, header);
    expect(out.id).toBe('evt_1');
  });

  test('rejects a tampered body (signature no longer matches)', () => {
    const { header } = signed(evt);
    const tampered = Buffer.from(JSON.stringify({ ...evt, id: 'evt_HACKED' }));
    expect(() => stripeBilling.constructEvent(tampered, header)).toThrow();
  });

  test('rejects a missing/garbage signature', () => {
    const { payload } = signed(evt);
    expect(() => stripeBilling.constructEvent(payload, 't=1,v1=deadbeef')).toThrow();
  });
});

describe('stripeBilling.mapEvent — grants only from real subscription state', () => {
  const sub = (status, withAddon, extra = {}) => ({
    id: 'evt', type: 'customer.subscription.updated', created: 1700000000,
    data: { object: {
      id: 'sub_123', status, customer: 'cus_123', current_period_end: 1800000000,
      metadata: { accountId: 'acct_1' },
      items: { data: withAddon ? [{ id: 'si_core', price: { id: 'price_core' } }, { id: 'si_addon', price: { id: 'price_addon' } }] : [{ id: 'si_core', price: { id: 'price_core' } }] },
      ...extra,
    } },
  });

  test('active WITH add-on item → renewed (grant), carries itemId + period + accountId', () => {
    const n = stripeBilling.mapEvent(sub('active', true));
    expect(n.type).toBe('renewed');
    expect(n.hasAddon).toBe(true);
    expect(n.itemId).toBe('si_addon');
    expect(n.accountId).toBe('acct_1');
    expect(n.currentPeriodEnd).toBe(1800000000 * 1000);
  });

  test('active WITHOUT add-on item → ended (Insights revoked, core continues)', () => {
    const n = stripeBilling.mapEvent(sub('active', false));
    expect(n.type).toBe('ended');
    expect(n.hasAddon).toBe(false);
  });

  test('past_due → payment_failed', () => {
    expect(stripeBilling.mapEvent(sub('past_due', true)).type).toBe('payment_failed');
  });

  test('subscription.deleted → ended', () => {
    const n = stripeBilling.mapEvent({ id: 'evt', type: 'customer.subscription.deleted', created: 1, data: { object: { id: 'sub_1', customer: 'cus_1', metadata: { accountId: 'acct_1' } } } });
    expect(n.type).toBe('ended');
  });

  test('one-off checkout (payment mode) → purchased one_off with report window', () => {
    const n = stripeBilling.mapEvent({ id: 'evt', type: 'checkout.session.completed', created: 1700000000, data: { object: { mode: 'payment', client_reference_id: 'acct_9', customer: 'cus_9', payment_intent: 'pi_9' } } });
    expect(n.type).toBe('purchased');
    expect(n.plan).toBe('one_off');
    expect(n.accountId).toBe('acct_9');
    expect(n.currentPeriodEnd).toBeGreaterThan(n.eventCreatedMs);
  });

  test('subscription-mode checkout is ignored (granted via subscription.* instead)', () => {
    expect(stripeBilling.mapEvent({ id: 'e', type: 'checkout.session.completed', created: 1, data: { object: { mode: 'subscription' } } })).toBeNull();
  });

  test('invoice.payment_failed → payment_failed with customerId for server-side resolution', () => {
    const n = stripeBilling.mapEvent({ id: 'evt', type: 'invoice.payment_failed', created: 1, data: { object: { customer: 'cus_7', subscription: 'sub_7' } } });
    expect(n.type).toBe('payment_failed');
    expect(n.customerId).toBe('cus_7');
    expect(n.accountId == null).toBe(true); // resolved from customerId in the DB layer
  });

  test('unhandled event types are ignored', () => {
    expect(stripeBilling.mapEvent({ id: 'e', type: 'invoice.payment_succeeded', created: 1, data: { object: {} } })).toBeNull();
    expect(stripeBilling.mapEvent(null)).toBeNull();
  });
});

describe('stripeBilling.resolveSaleMode — honest about recurring vs one-off', () => {
  test('subscription sale only when the census data is configured', () => {
    expect(stripeBilling.resolveSaleMode({ dataConfigured: true })).toBe('subscription');
  });
  test('falls back to one-off report when data is NOT configured', () => {
    expect(stripeBilling.resolveSaleMode({ dataConfigured: false })).toBe('one_off');
  });
  test('purchasingAvailable follows the resolved mode', () => {
    expect(stripeBilling.purchasingAvailable({ dataConfigured: false })).toBe(true);
  });
  test('formatMoney renders GBP', () => {
    expect(stripeBilling.formatMoney(1900, 'gbp')).toMatch(/19\.00/);
  });
});

describe('entitlement ingest decision — duplicate + out-of-order safety (pure)', () => {
  test('applies a fresh event', () => {
    expect(ent.decideIngest({ lastEventAt: null, lastEventId: null }, { eventCreatedMs: 100, eventId: 'e1' }).apply).toBe(true);
  });
  test('skips a duplicate event id', () => {
    const d = ent.decideIngest({ lastEventAt: 100, lastEventId: 'e1' }, { eventCreatedMs: 100, eventId: 'e1' });
    expect(d.apply).toBe(false);
    expect(d.reason).toBe('duplicate');
  });
  test('skips a stale (older) event', () => {
    const d = ent.decideIngest({ lastEventAt: 200, lastEventId: 'e2' }, { eventCreatedMs: 150, eventId: 'e-old' });
    expect(d.apply).toBe(false);
    expect(d.reason).toBe('stale');
  });
  test('applies a newer event', () => {
    expect(ent.decideIngest({ lastEventAt: 200, lastEventId: 'e2' }, { eventCreatedMs: 250, eventId: 'e3' }).apply).toBe(true);
  });
});

describe('entitlementPatchFor — maps identifiers + stamps the ordering guard', () => {
  test('renewed event records stripe mapping + period + lastEvent stamps', () => {
    const p = ent.entitlementPatchFor({
      type: 'renewed', source: 'stripe', plan: 'subscription', customerId: 'cus_1', subscriptionId: 'sub_1',
      itemId: 'si_addon', reference: 'sub_1', currentPeriodEnd: 123, eventId: 'evt_1', eventCreatedMs: 999,
    }, ent.DEFAULT, 1000);
    expect(p.status).toBe('active');
    expect(p.customerId).toBe('cus_1');
    expect(p.subscriptionId).toBe('sub_1');
    expect(p.itemId).toBe('si_addon');
    expect(p.currentPeriodEnd).toBe(123);
    expect(p.lastEventId).toBe('evt_1');
    expect(p.lastEventAt).toBe(999);
  });
  test('ended event revokes but keeps the mapping', () => {
    const p = ent.entitlementPatchFor({ type: 'ended', customerId: 'cus_1', subscriptionId: 'sub_1', itemId: null, eventId: 'evt_2', eventCreatedMs: 1001 }, { ...ent.DEFAULT, customerId: 'cus_1' }, 2000);
    expect(p.status).toBe('cancelled');
    expect(p.currentPeriodEnd).toBe(2000);
    expect(p.itemId).toBe(null); // add-on removed
  });
});
