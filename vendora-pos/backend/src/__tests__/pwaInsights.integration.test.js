'use strict';

// Neighbourhood Insights — server-enforced entitlement + billing-webhook lifecycle + cross-shop isolation.
// DB-gated (VENDORA_TEST_URI); SKIPPED when unset. Enables the add-on + a webhook secret for this run and
// stubs the postcode lookup so no network is needed.
if (process.env.VENDORA_DNS_PUBLIC === '1') {
  try { require('dns').setServers(['8.8.8.8', '1.1.1.1']); } catch { /* keep default resolver */ }
}
process.env.INSIGHTS_ENABLED = 'true';
process.env.INSIGHTS_BILLING_WEBHOOK_SECRET = 'test-webhook-secret';

const mongoose = require('mongoose');
const request = require('supertest');

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

  dbTest('checkout says purchasing is unavailable (no billing provider configured)', async () => {
    const a = await newOwner('Ins A6');
    const res = await request(app).post('/api/pwa-insights/checkout').set('Authorization', `Bearer ${a.token}`).send({});
    expect(res.status).toBe(503);
  });
});
