'use strict';

// Integration tests for server-side sync version history + restore (Phase 1.3). Self-contained like the
// other pwa*.integration suites: connects to VENDORA_TEST_URI, cleans up only what it creates, SKIPPED when
// the URI is unset. SYNC_HISTORY is forced on for this file BEFORE app/config load so the feature is active.
process.env.SYNC_HISTORY = 'true';
process.env.SYNC_HISTORY_KEEP = process.env.SYNC_HISTORY_KEEP || '10';

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
let SyncBlobHistory;
let token;
let accountId;

async function registerAndLogin() {
  const email = `pwa-synchist-test+${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;
  const res = await request(app).post('/api/pwa-auth/register')
    .send({ email, password: 'sup3rsecret', shopName: 'History Shop' });
  return { token: res.body.token, id: res.body.shop.id };
}

beforeAll(async () => {
  if (!URI) return;
  await mongoose.connect(URI);
  app = require('../app');
  Account = require('../models/Account');
  Member = require('../models/Member');
  SyncBlob = require('../models/SyncBlob');
  SyncBlobHistory = require('../models/SyncBlobHistory');
  await Member.deleteMany({ email: /pwa-synchist-test/i });
  await Account.deleteMany({ email: /pwa-synchist-test/i });
  const s = await registerAndLogin();
  token = s.token;
  accountId = s.id;
}, 60000);

afterAll(async () => {
  if (!URI) return;
  if (SyncBlob && accountId) await SyncBlob.deleteMany({ account: accountId });
  if (SyncBlobHistory && accountId) await SyncBlobHistory.deleteMany({ account: accountId });
  if (Member) await Member.deleteMany({ email: /pwa-synchist-test/i });
  if (Account) await Account.deleteMany({ email: /pwa-synchist-test/i });
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const auth = (req) => req.set('Authorization', `Bearer ${token}`);

describe('PWA sync — server version history + restore (Phase 1.3)', () => {
  dbTest('records a revision on each write and lists them', async () => {
    const v1 = JSON.stringify([{ id: 'a', qty: 1 }]);
    const v2 = JSON.stringify([{ id: 'a', qty: 2 }]);
    await auth(request(app).post('/api/pwa-sync/push')).send({ changes: [{ name: 'inventory_v1', value: v1, baseRev: 0, mtime: 1000 }] });
    await auth(request(app).post('/api/pwa-sync/push')).send({ changes: [{ name: 'inventory_v1', value: v2, baseRev: 1, mtime: 2000 }] });

    const hist = await auth(request(app).get('/api/pwa-sync/history'));
    expect(hist.status).toBe(200);
    expect(hist.body.enabled).toBe(true);
    const revs = (hist.body.history.inventory_v1 || []).map((h) => h.rev).sort((a, b) => a - b);
    expect(revs).toEqual([1, 2]);
    // Metadata only — no values leaked in the list.
    expect(hist.body.history.inventory_v1[0].value).toBeUndefined();
  });

  dbTest('a bad overwrite is recoverable: restore brings back the prior value', async () => {
    // Current good value is v2 (qty 2, rev 2). Now a "bad" overwrite lands.
    const bad = JSON.stringify([{ id: 'a', qty: 999 }]);
    const push = await auth(request(app).post('/api/pwa-sync/push')).send({ changes: [{ name: 'inventory_v1', value: bad, baseRev: 2, mtime: 3000 }] });
    expect(push.body.applied).toEqual([{ name: 'inventory_v1', rev: 3 }]);

    // Restore revision 2 (the last good one).
    const restore = await auth(request(app).post('/api/pwa-sync/restore')).send({ name: 'inventory_v1', rev: 2 });
    expect(restore.status).toBe(200);
    expect(restore.body.fromRev).toBe(2);

    // The current blob now holds the good value again (at a new, higher rev that propagates to devices).
    const pull = await auth(request(app).get('/api/pwa-sync/pull'));
    const blob = pull.body.blobs.find((b) => b.name === 'inventory_v1');
    expect(blob.value).toBe(JSON.stringify([{ id: 'a', qty: 2 }]));
    expect(blob.rev).toBe(4);
  });

  dbTest('a specific historical value can be fetched', async () => {
    const res = await auth(request(app).get('/api/pwa-sync/history/inventory_v1/1'));
    expect(res.status).toBe(200);
    expect(res.body.value).toBe(JSON.stringify([{ id: 'a', qty: 1 }]));
  });

  dbTest('staff cannot restore (403)', async () => {
    const email = `pwa-synchist-test+staff${Date.now()}@example.com`;
    await auth(request(app).post('/api/pwa-auth/staff')).send({ email, name: 'Floor', role: 'staff', password: 'staffpass1' });
    const login = await request(app).post('/api/pwa-auth/login').send({ email, password: 'staffpass1' });
    const res = await request(app).post('/api/pwa-sync/restore')
      .set('Authorization', `Bearer ${login.body.token}`).send({ name: 'inventory_v1', rev: 1 });
    expect(res.status).toBe(403);
  });
});
