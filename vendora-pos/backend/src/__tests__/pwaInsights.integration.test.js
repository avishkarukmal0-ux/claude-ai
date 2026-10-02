'use strict';

// Neighbourhood Insights — server-enforced entitlement + billing-webhook lifecycle + cross-shop isolation.
// DB-gated (VENDORA_TEST_URI); SKIPPED when unset. Enables the add-on + a webhook secret for this run and
// stubs the postcode lookup so no network is needed.
if (process.env.VENDORA_DNS_PUBLIC === '1') {
  try { require('dns').setServers(['8.8.8.8', '1.1.1.1']); } catch { /* keep default resolver */ }
}
process.env.INSIGHTS_ENABLED = 'true';
process.env.INSIGHTS_BILLING_WEBHOOK_SECRET = 'test-webhook-secret';
// Configure Stripe billing so the REAL raw-body signed webhook is active. saleMode='subscription' with NO
// census data provider and NO one-off price → nothing is actually on sale (checkout still 503), but the
// signed webhook endpoint works, letting us test signature verification + entitlement end-to-end.
process.env.INSIGHTS_BILLING_PROVIDER = 'stripe';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummydummydummy';
process.env.INSIGHTS_STRIPE_WEBHOOK_SECRET = 'whsec_itest_secret';
process.env.INSIGHTS_STRIPE_PRICE_CORE = 'price_core';
process.env.INSIGHTS_STRIPE_PRICE_ADDON = 'price_addon';
process.env.INSIGHTS_SALE_MODE = 'subscription';

const mongoose = require('mongoose');
const request = require('supertest');
const Stripe = require('stripe');

const stripeLib = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
function stripeSigned(eventObj) {
  const payload = JSON.stringify(eventObj);
  const header = stripeLib.webhooks.generateTestHeaderString({ payload, secret: process.env.INSIGHTS_STRIPE_WEBHOOK_SECRET });
  return { payload, header };
}
function subUpdatedActiveWithAddon(accountId) {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type: 'customer.subscription.updated', created: Math.floor(Date.now() / 1000),
    data: { object: { id: 'sub_itest', status: 'active', customer: 'cus_itest', current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400, metadata: { accountId: String(accountId) }, items: { data: [{ id: 'si_core', price: { id: 'price_core' } }, { id: 'si_addon', price: { id: 'price_addon' } }] } } },
  };
}

const URI = process.env.VENDORA_TEST_URI;
const dbTest = URI ? test : test.skip;

let app; let Account; let loc;
const email = () => `pwa-ins-test+${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;

beforeAll(async () => {
  if (!URI) return;
  await mongoose.connect(URI);
  app = require('../app');
  Account = require('../models/Account');
  loc = require('../services/insightsLocation');
  // Stub postcodes.io → a valid England location (no network in CI).
  loc.__setTransport(async () => ({ status: 200, json: { result: { country: 'England', latitude: 51.5, longitude: -0.1, postcode: 'EC1A 1BB', admin_district: 'Islington', codes: { oa: 'E00000001' } } } }));
  await Account.deleteMany({ email: /pwa-ins-test/i });
}, 60000);

afterAll(async () => {
  if (!URI) return;
  if (loc) loc.__setTransport(null);
  if (Account) await Account.deleteMany({ email: /pwa-ins-test/i });
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

async function newOwner(shopName) {
  const reg = await request(app).post('/api/pwa-auth/register').send({ email: email(), password: 'sup3rsecret', shopName });
  return { token: reg.body.token, id: reg.body.shop.id };
}

describe('pwa-insights — entitlement enforced on the server', () => {
  dbTest('a profile is refused (402) without an entitlement', async () => {
    const a = await newOwner('Ins A');
    const res = await request(app).post('/api/pwa-insights/profile').set('Authorization', `Bearer ${a.token}`).send({ postcode: 'EC1A 1BB', radiusM: 1000 });
    expect(res.status).toBe(402);
  });

  dbTest('the billing webhook grants access, then the profile works (configured:false, never fabricated)', async () => {
    const a = await newOwner('Ins A2');
    const hook = await request(app).post('/api/pwa-insights/billing/webhook')
      .set('x-insights-signature', 'test-webhook-secret')
      .send({ type: 'purchased', accountId: a.id, currentPeriodEnd: Date.now() + 30 * 86400000, source: 'test' });
    expect(hook.status).toBe(200);
    expect(hook.body.status).toBe('active');

    const res = await request(app).post('/api/pwa-insights/profile').set('Authorization', `Bearer ${a.token}`).send({ postcode: 'EC1A 1BB', radiusM: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.supported).toBe(true);
    expect(res.body.configured).toBe(false); // no census DATA provider → honest, not fake numbers
    expect(res.body.profile).toBeUndefined();
  });

  dbTest('entitlement is per-shop — granting A does not entitle B', async () => {
    const a = await newOwner('Ins A3');
    const b = await newOwner('Ins B3');
    await request(app).post('/api/pwa-insights/billing/webhook').set('x-insights-signature', 'test-webhook-secret').send({ type: 'purchased', accountId: a.id, currentPeriodEnd: Date.now() + 86400000 });
    const bRes = await request(app).post('/api/pwa-insights/profile').set('Authorization', `Bearer ${b.token}`).send({ postcode: 'EC1A 1BB', radiusM: 1000 });
    expect(bRes.status).toBe(402);
  });

  dbTest('a failed payment revokes access (past_due)', async () => {
    const a = await newOwner('Ins A4');
    await request(app).post('/api/pwa-insights/billing/webhook').set('x-insights-signature', 'test-webhook-secret').send({ type: 'purchased', accountId: a.id, currentPeriodEnd: Date.now() + 86400000 });
    await request(app).post('/api/pwa-insights/billing/webhook').set('x-insights-signature', 'test-webhook-secret').send({ type: 'payment_failed', accountId: a.id });
    const res = await request(app).post('/api/pwa-insights/profile').set('Authorization', `Bearer ${a.token}`).send({ postcode: 'EC1A 1BB', radiusM: 1000 });
    expect(res.status).toBe(402);
  });

  dbTest('the webhook rejects a bad signature (client can’t self-grant)', async () => {
    const a = await newOwner('Ins A5');
    const res = await request(app).post('/api/pwa-insights/billing/webhook').set('x-insights-signature', 'wrong').send({ type: 'purchased', accountId: a.id });
    expect(res.status).toBe(401);
  });

  dbTest('checkout says purchasing is unavailable (nothing on sale: no data + no one-off price)', async () => {
    const a = await newOwner('Ins A6');
    const res = await request(app).post('/api/pwa-insights/checkout').set('Authorization', `Bearer ${a.token}`).send({});
    expect(res.status).toBe(503);
  });

  dbTest('core PWA access stays available WITHOUT the add-on (images status 200 while profile 402)', async () => {
    const a = await newOwner('Ins Core');
    const core = await request(app).get('/api/pwa-images/status').set('Authorization', `Bearer ${a.token}`);
    expect(core.status).toBe(200); // the rest of the PWA works with no entitlement
    const prof = await request(app).post('/api/pwa-insights/profile').set('Authorization', `Bearer ${a.token}`).send({ postcode: 'EC1A 1BB', radiusM: 1000 });
    expect(prof.status).toBe(402);
  });

  dbTest('a duplicate webhook delivery is a safe no-op (idempotent)', async () => {
    const a = await newOwner('Ins Dup');
    const body = { type: 'purchased', accountId: a.id, currentPeriodEnd: Date.now() + 30 * 86400000, eventId: `dup_${Date.now()}`, eventCreatedMs: Date.now() };
    const first = await request(app).post('/api/pwa-insights/billing/webhook').set('x-insights-signature', 'test-webhook-secret').send(body);
    expect(first.body.status).toBe('active');
    const second = await request(app).post('/api/pwa-insights/billing/webhook').set('x-insights-signature', 'test-webhook-secret').send(body);
    expect(second.body.duplicate).toBe(true);
    const prof = await request(app).post('/api/pwa-insights/profile').set('Authorization', `Bearer ${a.token}`).send({ postcode: 'EC1A 1BB', radiusM: 1000 });
    expect(prof.status).toBe(200); // still entitled
  });

  dbTest('an out-of-order (older) event is ignored; a newer one applies', async () => {
    const a = await newOwner('Ins Order');
    const t = Date.now();
    await request(app).post('/api/pwa-insights/billing/webhook').set('x-insights-signature', 'test-webhook-secret')
      .send({ type: 'purchased', accountId: a.id, currentPeriodEnd: t + 30 * 86400000, eventId: `o1_${t}`, eventCreatedMs: t + 2000 });
    // Older payment_failed arrives late → must NOT revoke the newer active state.
    const stale = await request(app).post('/api/pwa-insights/billing/webhook').set('x-insights-signature', 'test-webhook-secret')
      .send({ type: 'payment_failed', accountId: a.id, eventId: `o2_${t}`, eventCreatedMs: t + 1000 });
    expect(stale.body.skipped).toBe(true);
    const stillOk = await request(app).post('/api/pwa-insights/profile').set('Authorization', `Bearer ${a.token}`).send({ postcode: 'EC1A 1BB', radiusM: 1000 });
    expect(stillOk.status).toBe(200);
    // A genuinely newer payment_failed DOES revoke.
    await request(app).post('/api/pwa-insights/billing/webhook').set('x-insights-signature', 'test-webhook-secret')
      .send({ type: 'payment_failed', accountId: a.id, eventId: `o3_${t}`, eventCreatedMs: t + 3000 });
    const revoked = await request(app).post('/api/pwa-insights/profile').set('Authorization', `Bearer ${a.token}`).send({ postcode: 'EC1A 1BB', radiusM: 1000 });
    expect(revoked.status).toBe(402);
  });

  dbTest('the REAL Stripe webhook (raw body, signed) grants access; a forged body is rejected', async () => {
    const a = await newOwner('Ins Stripe');
    const { payload, header } = stripeSigned(subUpdatedActiveWithAddon(a.id));
    const ok = await request(app).post('/api/pwa-insights/billing/stripe/webhook')
      .set('stripe-signature', header).set('Content-Type', 'application/json').send(Buffer.from(payload));
    expect(ok.status).toBe(200);
    const prof = await request(app).post('/api/pwa-insights/profile').set('Authorization', `Bearer ${a.token}`).send({ postcode: 'EC1A 1BB', radiusM: 1000 });
    expect(prof.status).toBe(200); // entitled via the signed webhook

    const forged = await request(app).post('/api/pwa-insights/billing/stripe/webhook')
      .set('stripe-signature', header).set('Content-Type', 'application/json').send(Buffer.from(payload.replace('sub_itest', 'sub_HACK')));
    expect(forged.status).toBe(400); // signature no longer matches the body
  });
});
