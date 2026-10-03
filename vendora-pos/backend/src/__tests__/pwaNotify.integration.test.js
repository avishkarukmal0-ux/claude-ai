'use strict';

// Integration tests for PWA notification prefs (/api/pwa-notify) — mandate #6.
//
// SELF-CONTAINED like the other PWA integration suites: connects to VENDORA_TEST_URI itself, uses only
// that database, and cleans up only what it creates. SKIPPED (not passed) when VENDORA_TEST_URI is unset.
if (process.env.VENDORA_DNS_PUBLIC === '1') {
  try { require('dns').setServers(['8.8.8.8', '1.1.1.1']); } catch { /* keep default resolver */ }
}

const mongoose = require('mongoose');
const request = require('supertest');

const URI = process.env.VENDORA_TEST_URI;
const dbTest = URI ? test : test.skip;

let app;
let Account;
let Member;

const uniqueEmail = () => `pwa-notify-test+${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;

beforeAll(async () => {
  if (!URI) return;
  await mongoose.connect(URI);
  app = require('../app');
  Account = require('../models/Account');
  Member = require('../models/Member');
  await Member.deleteMany({ email: /pwa-notify-test/i });
  await Account.deleteMany({ email: /pwa-notify-test/i });
}, 60000);

afterAll(async () => {
  if (!URI) return;
  if (Member) await Member.deleteMany({ email: /pwa-notify-test/i });
  if (Account) await Account.deleteMany({ email: /pwa-notify-test/i });
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

async function newOwner() {
  const reg = await request(app).post('/api/pwa-auth/register').send({ email: uniqueEmail(), password: 'sup3rsecret', shopName: 'Notify Shop' });
  return { token: reg.body.token, id: reg.body.shop.id };
}

describe('PWA notify — /api/pwa-notify', () => {
  dbTest('prefs default to off and report whether email is configured', async () => {
    const owner = await newOwner();
    const res = await request(app).get('/api/pwa-notify/prefs').set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body.prefs.email.enabled).toBe(false);
    expect(typeof res.body.configured).toBe('boolean'); // false unless a provider is set in the test env
  });

  dbTest('owner can update prefs; values persist and are clamped', async () => {
    const owner = await newOwner();
    const put = await request(app).put('/api/pwa-notify/prefs').set('Authorization', `Bearer ${owner.token}`)
      .send({ email: { enabled: true }, sendHour: 99, quietFrom: 22, quietTo: 6, expiryDays: 5, recipient: 'me@shop.co' });
    expect(put.status).toBe(200);
    expect(put.body.prefs.email.enabled).toBe(true);
    expect(put.body.prefs.sendHour).toBe(23); // clamped 0..23
    expect(put.body.prefs.expiryDays).toBe(5);
    expect(put.body.prefs.recipient).toBe('me@shop.co');
  });

  dbTest('a staff member cannot change prefs (403)', async () => {
    const owner = await newOwner();
    const email = uniqueEmail();
    await request(app).post('/api/pwa-auth/staff').set('Authorization', `Bearer ${owner.token}`)
      .send({ email, name: 'Floor', role: 'staff', password: 'staffpass1' });
    const login = await request(app).post('/api/pwa-auth/login').send({ email, password: 'staffpass1' });
    const res = await request(app).put('/api/pwa-notify/prefs').set('Authorization', `Bearer ${login.body.token}`)
      .send({ email: { enabled: true } });
    expect(res.status).toBe(403);
  });

  dbTest('preview returns a digest shape without sending', async () => {
    const owner = await newOwner();
    const res = await request(app).get('/api/pwa-notify/preview').set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body.digest).toHaveProperty('empty');
    expect(res.body.digest).toHaveProperty('expiry');
    expect(res.body.digest).toHaveProperty('claims');
  });

  dbTest('the scheduler trigger is 404 unless NOTIFY_RUN_TOKEN is configured', async () => {
    const res = await request(app).post('/api/pwa-notify/run').set('x-notify-token', 'whatever');
    expect(res.status).toBe(404); // disabled by default — no token set in the test env
  });

  dbTest('prefs + preview require a token (401)', async () => {
    expect((await request(app).get('/api/pwa-notify/prefs')).status).toBe(401);
    expect((await request(app).get('/api/pwa-notify/preview')).status).toBe(401);
  });
});
