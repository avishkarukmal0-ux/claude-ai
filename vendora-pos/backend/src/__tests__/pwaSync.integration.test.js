'use strict';

// Integration tests for PWA cross-device sync (/api/pwa-sync) — infra Stage 3.
//
// SELF-CONTAINED like pwaAuth.integration.test.js: connects to VENDORA_TEST_URI itself, uses only the
// database in that URI (vendora_test), and cleans up only the accounts + blobs it creates. SKIPPED (not
// passed) when VENDORA_TEST_URI is unset.
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
let SyncBlob;
let token;
let accountId;

async function registerAndLogin() {
  const email = `pwa-sync-test+${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;
  const res = await request(app).post('/api/pwa-auth/register')
    .send({ email, password: 'sup3rsecret', shopName: 'Sync Shop' });
  return { token: res.body.token, id: res.body.shop.id };
}

beforeAll(async () => {
  if (!URI) return;
  await mongoose.connect(URI);
  app = require('../app');
  Account = require('../models/Account');
  Member = require('../models/Member');
  SyncBlob = require('../models/SyncBlob');
  await Member.deleteMany({ email: /pwa-sync-test/i });
  await Account.deleteMany({ email: /pwa-sync-test/i });
  const s = await registerAndLogin();
  token = s.token;
  accountId = s.id;
}, 60000);

afterAll(async () => {
  if (!URI) return;
  if (SyncBlob && accountId) await SyncBlob.deleteMany({ account: accountId });
  if (Member) await Member.deleteMany({ email: /pwa-sync-test/i });
  if (Account) await Account.deleteMany({ email: /pwa-sync-test/i });
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const auth = (req) => req.set('Authorization', `Bearer ${token}`);

describe('PWA sync — /api/pwa-sync', () => {
  dbTest('pull is empty for a fresh account', async () => {
    const res = await auth(request(app).get('/api/pwa-sync/pull'));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.blobs).toEqual([]);
  });

  dbTest('push creates a store at rev 1, and pull returns it', async () => {
    const value = JSON.stringify([{ id: 'a', qty: 3 }]);
    const push = await auth(request(app).post('/api/pwa-sync/push'))
      .send({ changes: [{ name: 'inventory_v1', value, baseRev: 0, mtime: 1000 }] });
    expect(push.status).toBe(200);
    expect(push.body.applied).toEqual([{ name: 'inventory_v1', rev: 1 }]);
    expect(push.body.conflicts).toEqual([]);

    const pull = await auth(request(app).get('/api/pwa-sync/pull'));
    const blob = pull.body.blobs.find((b) => b.name === 'inventory_v1');
    expect(blob).toMatchObject({ value, rev: 1, mtime: 1000 });
  });

  dbTest('a fast-forward push (baseRev matches) bumps the rev', async () => {
    const v2 = JSON.stringify([{ id: 'a', qty: 5 }]);
    const res = await auth(request(app).post('/api/pwa-sync/push'))
      .send({ changes: [{ name: 'inventory_v1', value: v2, baseRev: 1, mtime: 2000 }] });
    expect(res.status).toBe(200);
    expect(res.body.applied).toEqual([{ name: 'inventory_v1', rev: 2 }]);
  });

  dbTest('a stale push (older mtime, wrong baseRev) is returned as a conflict, not applied', async () => {
    const stale = JSON.stringify([{ id: 'a', qty: 999 }]);
    const res = await auth(request(app).post('/api/pwa-sync/push'))
      .send({ changes: [{ name: 'inventory_v1', value: stale, baseRev: 1, mtime: 1500 }] });
    expect(res.status).toBe(200);
    expect(res.body.applied).toEqual([]);
    expect(res.body.conflicts).toHaveLength(1);
    expect(res.body.conflicts[0]).toMatchObject({ name: 'inventory_v1', rev: 2 }); // server's copy wins
  });

  dbTest('a newer-mtime push wins even with a wrong baseRev (last-write-wins)', async () => {
    const newer = JSON.stringify([{ id: 'a', qty: 7 }]);
    const res = await auth(request(app).post('/api/pwa-sync/push'))
      .send({ changes: [{ name: 'inventory_v1', value: newer, baseRev: 1, mtime: 9999 }] });
    expect(res.status).toBe(200);
    expect(res.body.applied).toEqual([{ name: 'inventory_v1', rev: 3 }]);
    expect(res.body.conflicts).toEqual([]);
  });

  dbTest('an unknown store name is rejected (422)', async () => {
    const res = await auth(request(app).post('/api/pwa-sync/push'))
      .send({ changes: [{ name: 'not_a_real_store', value: '[]', baseRev: 0, mtime: 1 }] });
    expect(res.status).toBe(422);
  });

  dbTest('an oversize value is rejected (422)', async () => {
    const big = 'x'.repeat(2 * 1024 * 1024 + 10);
    const res = await auth(request(app).post('/api/pwa-sync/push'))
      .send({ changes: [{ name: 'movements_v1', value: big, baseRev: 0, mtime: 1 }] });
    expect(res.status).toBe(422);
  });

  dbTest('both endpoints require a valid token (401)', async () => {
    const pull = await request(app).get('/api/pwa-sync/pull');
    expect(pull.status).toBe(401);
    const push = await request(app).post('/api/pwa-sync/push').send({ changes: [] });
    expect(push.status).toBe(401);
  });

  dbTest('one account cannot see another account\'s blobs', async () => {
    const other = await registerAndLogin();
    const res = await request(app).get('/api/pwa-sync/pull').set('Authorization', `Bearer ${other.token}`);
    expect(res.status).toBe(200);
    expect(res.body.blobs).toEqual([]); // isolated — sees none of the first account's data
    await SyncBlob.deleteMany({ account: other.id });
  });
});

describe('PWA sync — role-based store access (staff)', () => {
  let staffToken;
  let staffId;
  let ownerToken;
  let shopId;

  // A dedicated owner + staff member so we don't disturb the main suite's blobs.
  beforeAll(async () => {
    if (!URI) return;
    const owner = await registerAndLogin();
    ownerToken = owner.token;
    shopId = owner.id;
    const email = `pwa-sync-test+staff${Date.now()}@example.com`;
    const created = await request(app).post('/api/pwa-auth/staff').set('Authorization', `Bearer ${ownerToken}`)
      .send({ email, name: 'Floor Staff', role: 'staff', password: 'staffpass1' });
    staffId = created.body.member.id;
    const login = await request(app).post('/api/pwa-auth/login').send({ email, password: 'staffpass1' });
    staffToken = login.body.token;
  });

  dbTest('staff can push an operational store', async () => {
    const res = await request(app).post('/api/pwa-sync/push').set('Authorization', `Bearer ${staffToken}`)
      .send({ changes: [{ name: 'stocktake_v1', value: '[]', baseRev: 0, mtime: 10 }] });
    expect(res.status).toBe(200);
    expect(res.body.applied).toEqual([{ name: 'stocktake_v1', rev: 1 }]);
    expect(res.body.rejected).toEqual([]);
  });

  dbTest('staff cannot push a financial store — it is rejected, not applied', async () => {
    const res = await request(app).post('/api/pwa-sync/push').set('Authorization', `Bearer ${staffToken}`)
      .send({ changes: [{ name: 'takings_v1', value: '[{"cash":500}]', baseRev: 0, mtime: 20 }] });
    expect(res.status).toBe(200);
    expect(res.body.applied).toEqual([]);
    expect(res.body.rejected).toEqual([{ name: 'takings_v1', reason: 'forbidden' }]);
    // And nothing was written for that store.
    const blob = await SyncBlob.findOne({ account: shopId, name: 'takings_v1' });
    expect(blob).toBeNull();
  });

  dbTest('staff pull omits financial stores the owner wrote', async () => {
    // Owner writes a financial store.
    await request(app).post('/api/pwa-sync/push').set('Authorization', `Bearer ${ownerToken}`)
      .send({ changes: [{ name: 'claims_v1', value: '[{"id":"c1"}]', baseRev: 0, mtime: 30 }] });

    const ownerPull = await request(app).get('/api/pwa-sync/pull').set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerPull.body.blobs.some((b) => b.name === 'claims_v1')).toBe(true);

    const staffPull = await request(app).get('/api/pwa-sync/pull').set('Authorization', `Bearer ${staffToken}`);
    expect(staffPull.body.blobs.some((b) => b.name === 'claims_v1')).toBe(false); // withheld from staff
    expect(staffPull.body.blobs.some((b) => b.name === 'stocktake_v1')).toBe(true); // operational still visible
  });

  dbTest('deactivating a member revokes their EXISTING access token on the sync path (Phase 1.4)', async () => {
    // The token still works right now…
    const before = await request(app).get('/api/pwa-sync/pull').set('Authorization', `Bearer ${staffToken}`);
    expect(before.status).toBe(200);
    // Owner deactivates the member (invalidates the member-status cache).
    const patch = await request(app).patch(`/api/pwa-auth/staff/${staffId}`)
      .set('Authorization', `Bearer ${ownerToken}`).send({ active: false });
    expect(patch.status).toBe(200);
    // …and the SAME token is now rejected without needing a refresh or waiting for expiry.
    const after = await request(app).get('/api/pwa-sync/pull').set('Authorization', `Bearer ${staffToken}`);
    expect(after.status).toBe(401);
    // Re-activate so later cross-suite state stays clean.
    await request(app).patch(`/api/pwa-auth/staff/${staffId}`)
      .set('Authorization', `Bearer ${ownerToken}`).send({ active: true });
  });

  afterAll(async () => {
    if (!URI || !shopId) return;
    await SyncBlob.deleteMany({ account: shopId });
  });
});
