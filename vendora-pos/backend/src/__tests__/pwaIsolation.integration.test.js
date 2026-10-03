'use strict';

// Phase 1 — shop isolation + unauthorised-access tests across API, uploads, background jobs (digest),
// notifications and staff. SELF-CONTAINED + DB-gated (VENDORA_TEST_URI); SKIPPED when unset.
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

const email = () => `pwa-iso-test+${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;

beforeAll(async () => {
  if (!URI) return;
  await mongoose.connect(URI);
  app = require('../app');
  Account = require('../models/Account');
  Member = require('../models/Member');
  SyncBlob = require('../models/SyncBlob');
  await Member.deleteMany({ email: /pwa-iso-test/i });
  await Account.deleteMany({ email: /pwa-iso-test/i });
}, 60000);

afterAll(async () => {
  if (!URI) return;
  if (Member) await Member.deleteMany({ email: /pwa-iso-test/i });
  if (Account) {
    const accts = await Account.find({ email: /pwa-iso-test/i }).select('_id');
    if (SyncBlob) await SyncBlob.deleteMany({ account: { $in: accts.map((a) => a._id) } });
    await Account.deleteMany({ email: /pwa-iso-test/i });
  }
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

async function newOwner(shopName) {
  const reg = await request(app).post('/api/pwa-auth/register').send({ email: email(), password: 'sup3rsecret', shopName });
  return { token: reg.body.token, id: reg.body.shop.id };
}

describe('isolation — sync (API)', () => {
  dbTest('one shop cannot read another shop\'s blobs', async () => {
    const a = await newOwner('Shop A');
    const b = await newOwner('Shop B');
    await request(app).post('/api/pwa-sync/push').set('Authorization', `Bearer ${a.token}`)
      .send({ changes: [{ name: 'inventory_v1', value: '[{"id":"a"}]', baseRev: 0, mtime: 1 }] });
    const bPull = await request(app).get('/api/pwa-sync/pull').set('Authorization', `Bearer ${b.token}`);
    expect(bPull.status).toBe(200);
    expect(bPull.body.blobs).toEqual([]); // B sees none of A's data
  });

  dbTest('sync requires a valid token', async () => {
    expect((await request(app).get('/api/pwa-sync/pull')).status).toBe(401);
    expect((await request(app).post('/api/pwa-sync/push').send({ changes: [] })).status).toBe(401);
  });
});

describe('isolation — staff admin (cross-tenant)', () => {
  dbTest('owner A cannot modify or delete a member of shop B (404, scoped by token)', async () => {
    const a = await newOwner('Shop A2');
    const b = await newOwner('Shop B2');
    const add = await request(app).post('/api/pwa-auth/staff').set('Authorization', `Bearer ${b.token}`)
      .send({ email: email(), name: 'B Staff', role: 'staff', password: 'password1' });
    const memberId = add.body.member.id;

    const patch = await request(app).patch(`/api/pwa-auth/staff/${memberId}`).set('Authorization', `Bearer ${a.token}`).send({ role: 'manager' });
    expect(patch.status).toBe(404); // A's token is scoped to A — B's member is invisible
    const del = await request(app).delete(`/api/pwa-auth/staff/${memberId}`).set('Authorization', `Bearer ${a.token}`);
    expect(del.status).toBe(404);

    // And B's member is untouched.
    const list = await request(app).get('/api/pwa-auth/staff').set('Authorization', `Bearer ${b.token}`);
    expect(list.body.members[0]).toMatchObject({ id: memberId, role: 'staff' });
  });
});

describe('isolation — notifications (prefs + digest)', () => {
  dbTest('A changing its prefs does not affect B', async () => {
    const a = await newOwner('Shop A3');
    const b = await newOwner('Shop B3');
    await request(app).put('/api/pwa-notify/prefs').set('Authorization', `Bearer ${a.token}`).send({ email: { enabled: true }, sendHour: 9 });
    const bPrefs = await request(app).get('/api/pwa-notify/prefs').set('Authorization', `Bearer ${b.token}`);
    expect(bPrefs.body.prefs.email.enabled).toBe(false); // B unchanged (default off)
  });

  dbTest('the per-account digest preview only reflects that account\'s data (background-job isolation)', async () => {
    const a = await newOwner('Shop A4');
    const b = await newOwner('Shop B4');
    // A has an overdue claim; B has nothing.
    const overdue = JSON.stringify([{ status: 'submitted', supplierName: 'Bestway', requestedAmount: 20, followUpDate: '2020-01-01' }]);
    await request(app).post('/api/pwa-sync/push').set('Authorization', `Bearer ${a.token}`)
      .send({ changes: [{ name: 'claims_v1', value: overdue, baseRev: 0, mtime: 1 }] });

    const aPrev = await request(app).get('/api/pwa-notify/preview').set('Authorization', `Bearer ${a.token}`);
    const bPrev = await request(app).get('/api/pwa-notify/preview').set('Authorization', `Bearer ${b.token}`);
    expect(aPrev.body.digest.claims.count).toBe(1);
    expect(bPrev.body.digest.claims.count).toBe(0); // B's digest never contains A's claim
  });

  dbTest('notify prefs/preview require a token', async () => {
    expect((await request(app).get('/api/pwa-notify/prefs')).status).toBe(401);
    expect((await request(app).get('/api/pwa-notify/preview')).status).toBe(401);
  });
});

describe('isolation — uploads / OCR', () => {
  dbTest('the OCR endpoint requires a valid token', async () => {
    expect((await request(app).get('/api/pwa-invoice-ocr/status')).status).toBe(401);
    expect((await request(app).post('/api/pwa-invoice-ocr').send({ dataUrl: 'data:image/png;base64,AAAA' })).status).toBe(401);
  });
});
