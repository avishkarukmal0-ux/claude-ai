'use strict';

// Neighbourhood route end-to-end against a REAL Mongo (DB-gated by VENDORA_TEST_URI → a disposable test DB,
// never production). The upstream (postcodes.io / Nomis) is STUBBED so no network is needed — this proves the
// route, the postcode→codes→figure flow, provenance, and the server-side cache. SKIPPED when the URI is unset.
if (process.env.VENDORA_DNS_PUBLIC === '1') {
  try { require('dns').setServers(['8.8.8.8', '1.1.1.1']); } catch { /* keep default resolver */ }
}
process.env.NEIGHBOURHOOD_ENABLED = 'true';
process.env.NEIGHBOURHOOD_SOURCE = 'nomis';
process.env.NEIGHBOURHOOD_POP_DATASET = 'NM_test_1';

const mongoose = require('mongoose');
const request = require('supertest');

const URI = process.env.VENDORA_TEST_URI;
const dbTest = URI ? test : test.skip;

let app; let Account; let svc; let NeighbourhoodArea;
const email = () => `pwa-nbh-test+${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;

beforeAll(async () => {
  if (!URI) return;
  await mongoose.connect(URI);
  app = require('../app');
  Account = require('../models/Account');
  svc = require('../services/neighbourhoodService');
  NeighbourhoodArea = require('../models/NeighbourhoodArea');
  // FIXTURE (test-only): stub the upstream so no network is needed — postcodes.io → area codes; Nomis → one obs
  // value. This mock lives ONLY in this test file; no production path contains sample/mock data.
  svc.__setTransport(async (url) => {
    if (/postcodes/.test(url)) {
      return { status: 200, headers: {}, body: { result: { postcode: 'RM10 8AA', country: 'England', admin_ward: 'Alibon', admin_district: 'Barking and Dagenham', codes: { lsoa: 'E01000036', msoa: 'E02000011' } } } };
    }
    if (/NM_test_1\.data\.json/.test(url)) {
      return { status: 200, headers: {}, body: { obs: [{ obs_value: { value: 1500 } }] } };
    }
    return { status: 404, headers: {}, body: null };
  });
  await Account.deleteMany({ email: /pwa-nbh-test/i });
  await NeighbourhoodArea.deleteMany({ postcode: 'RM108AA' });
}, 60000);

afterAll(async () => {
  if (!URI) return;
  if (svc) svc.__setTransport(null);
  if (Account) await Account.deleteMany({ email: /pwa-nbh-test/i });
  if (NeighbourhoodArea) await NeighbourhoodArea.deleteMany({ postcode: 'RM108AA' });
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

async function owner() {
  const reg = await request(app).post('/api/pwa-auth/register').send({ email: email(), password: 'sup3rsecret', shopName: 'Nbh Shop' });
  return reg.body.token;
}

describe('pwa-neighbourhood — real area figure, cached, with provenance', () => {
  dbTest('status reports enabled + dataset configured', async () => {
    const t = await owner();
    const res = await request(app).get('/api/pwa-neighbourhood/status').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.datasetConfigured).toBe(true);
  });

  dbTest('GET /area returns a real figure with full provenance + OGL attribution', async () => {
    const t = await owner();
    const res = await request(app).get('/api/pwa-neighbourhood/area?postcode=RM10%208AA').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    const pop = res.body.figures.find((f) => f.key === 'population');
    expect(pop.value).toBe(1500);
    expect(pop.source).toBe('Nomis');
    expect(pop.datasetId).toBe('NM_test_1');
    expect(pop.referenceDate).toBe('Census 2021');
    expect(pop.geographyCode).toBe('E01000036');
    expect(res.body.attribution).toMatch(/Open Government Licence/);
    expect(res.body.freshness).toBe('fresh');
  });

  dbTest('the figure is cached server-side (stored in Mongo)', async () => {
    const t = await owner();
    await request(app).get('/api/pwa-neighbourhood/area?postcode=RM10%208AA').set('Authorization', `Bearer ${t}`);
    const doc = await NeighbourhoodArea.findOne({ postcode: 'RM108AA' }).lean();
    expect(doc).toBeTruthy();
    expect(doc.figures[0].value).toBe(1500);
    expect(doc.lsoa21).toBe('E01000036');
  });

  dbTest('requires a token', async () => {
    const res = await request(app).get('/api/pwa-neighbourhood/area?postcode=RM10%208AA');
    expect(res.status).toBe(401);
  });

  dbTest('an invalid postcode is rejected (400), never fabricated', async () => {
    const t = await owner();
    const res = await request(app).get('/api/pwa-neighbourhood/area?postcode=NOPE').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(400);
  });
});
