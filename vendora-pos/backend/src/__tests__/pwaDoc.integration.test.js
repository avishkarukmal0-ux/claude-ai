'use strict';

// Phase 3 — invoice document backup (GridFS). Round-trip (upload→download), shop isolation, retention/delete.
// SELF-CONTAINED + DB-gated (VENDORA_TEST_URI); SKIPPED when unset. Enables DOC_BACKUP for this run.
if (process.env.VENDORA_DNS_PUBLIC === '1') {
  try { require('dns').setServers(['8.8.8.8', '1.1.1.1']); } catch { /* keep default resolver */ }
}
process.env.DOC_BACKUP = 'true'; // must be set before app/config is required

const mongoose = require('mongoose');
const request = require('supertest');

const URI = process.env.VENDORA_TEST_URI;
const dbTest = URI ? test : test.skip;

let app; let Account; let Member;
const email = () => `pwa-doc-test+${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;
// A tiny valid PNG (1x1).
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000002000154a24f5f0000000049454e44ae426082', 'hex');

beforeAll(async () => {
  if (!URI) return;
  await mongoose.connect(URI);
  app = require('../app');
  Account = require('../models/Account');
  Member = require('../models/Member');
  await Member.deleteMany({ email: /pwa-doc-test/i });
  await Account.deleteMany({ email: /pwa-doc-test/i });
}, 60000);

afterAll(async () => {
  if (!URI) return;
  if (Member) await Member.deleteMany({ email: /pwa-doc-test/i });
  if (Account) await Account.deleteMany({ email: /pwa-doc-test/i });
  // Clean the GridFS bucket entries created by the test.
  try {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'pwa_invoice_files' });
    const files = await bucket.find({ filename: /:doc-test-/ }).toArray();
    for (const f of files) { try { await bucket.delete(f._id); } catch { /* gone */ } }
  } catch { /* ignore */ }
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

async function newOwner(shopName) {
  const reg = await request(app).post('/api/pwa-auth/register').send({ email: email(), password: 'sup3rsecret', shopName });
  return { token: reg.body.token, id: reg.body.shop.id };
}

describe('pwa-docs — backup round-trip + isolation', () => {
  dbTest('status reports enabled', async () => {
    const a = await newOwner('Doc Shop A');
    const res = await request(app).get('/api/pwa-docs/status').set('Authorization', `Bearer ${a.token}`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });

  dbTest('upload → list → download returns the same bytes', async () => {
    const a = await newOwner('Doc Shop A2');
    const fileId = `doc-test-${Date.now()}`;
    const up = await request(app).post(`/api/pwa-docs/invoice/${fileId}`)
      .set('Authorization', `Bearer ${a.token}`)
      .attach('file', PNG, { filename: 'inv.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    expect(up.body.size).toBe(PNG.length);

    const list = await request(app).get('/api/pwa-docs/invoice').set('Authorization', `Bearer ${a.token}`);
    expect(list.body.files.map((f) => f.fileId)).toContain(fileId);

    const dl = await request(app).get(`/api/pwa-docs/invoice/${fileId}`).set('Authorization', `Bearer ${a.token}`).buffer(true).parse((res, cb) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(dl.status).toBe(200);
    expect(Buffer.compare(dl.body, PNG)).toBe(0); // byte-identical round-trip
  });

  dbTest('another shop cannot download or see this shop’s file (isolation)', async () => {
    const a = await newOwner('Doc Shop A3');
    const b = await newOwner('Doc Shop B3');
    const fileId = `doc-test-iso-${Date.now()}`;
    await request(app).post(`/api/pwa-docs/invoice/${fileId}`).set('Authorization', `Bearer ${a.token}`).attach('file', PNG, { filename: 'inv.png', contentType: 'image/png' });

    const bDl = await request(app).get(`/api/pwa-docs/invoice/${fileId}`).set('Authorization', `Bearer ${b.token}`);
    expect(bDl.status).toBe(404); // B must not reach A's file
    const bList = await request(app).get('/api/pwa-docs/invoice').set('Authorization', `Bearer ${b.token}`);
    expect(bList.body.files.map((f) => f.fileId)).not.toContain(fileId);
  });

  dbTest('rejects an unsupported file type', async () => {
    const a = await newOwner('Doc Shop A4');
    const res = await request(app).post(`/api/pwa-docs/invoice/doc-test-bad-${Date.now()}`)
      .set('Authorization', `Bearer ${a.token}`)
      .attach('file', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  dbTest('delete removes the backup (retention control)', async () => {
    const a = await newOwner('Doc Shop A5');
    const fileId = `doc-test-del-${Date.now()}`;
    await request(app).post(`/api/pwa-docs/invoice/${fileId}`).set('Authorization', `Bearer ${a.token}`).attach('file', PNG, { filename: 'inv.png', contentType: 'image/png' });
    const del = await request(app).delete(`/api/pwa-docs/invoice/${fileId}`).set('Authorization', `Bearer ${a.token}`);
    expect(del.status).toBe(200);
    const dl = await request(app).get(`/api/pwa-docs/invoice/${fileId}`).set('Authorization', `Bearer ${a.token}`);
    expect(dl.status).toBe(404);
  });

  dbTest('requires a token', async () => {
    const res = await request(app).get('/api/pwa-docs/invoice');
    expect(res.status).toBe(401);
  });
});
