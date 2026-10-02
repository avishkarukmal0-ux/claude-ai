'use strict';

// Product-image storage (GridFS) — round-trip + cross-shop isolation + delete. DB-gated (VENDORA_TEST_URI);
// SKIPPED when unset. Enables PRODUCT_IMAGES for this run.
if (process.env.VENDORA_DNS_PUBLIC === '1') {
  try { require('dns').setServers(['8.8.8.8', '1.1.1.1']); } catch { /* keep default resolver */ }
}
process.env.PRODUCT_IMAGES = 'true';

const mongoose = require('mongoose');
const request = require('supertest');

const URI = process.env.VENDORA_TEST_URI;
const dbTest = URI ? test : test.skip;

let app; let Account; let Member;
const email = () => `pwa-img-test+${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000002000154a24f5f0000000049454e44ae426082', 'hex');

beforeAll(async () => {
  if (!URI) return;
  await mongoose.connect(URI);
  app = require('../app');
  Account = require('../models/Account');
  Member = require('../models/Member');
  await Member.deleteMany({ email: /pwa-img-test/i });
  await Account.deleteMany({ email: /pwa-img-test/i });
}, 60000);

afterAll(async () => {
  if (!URI) return;
  if (Member) await Member.deleteMany({ email: /pwa-img-test/i });
  if (Account) await Account.deleteMany({ email: /pwa-img-test/i });
  try {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'pwa_product_images' });
    const files = await bucket.find({ filename: /:img-test-/ }).toArray();
    for (const f of files) { try { await bucket.delete(f._id); } catch { /* gone */ } }
  } catch { /* ignore */ }
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

async function newOwner(shopName) {
  const reg = await request(app).post('/api/pwa-auth/register').send({ email: email(), password: 'sup3rsecret', shopName });
  return { token: reg.body.token, id: reg.body.shop.id };
}

describe('pwa-images — round-trip + isolation', () => {
  dbTest('status reports enabled', async () => {
    const a = await newOwner('Img Shop A');
    const res = await request(app).get('/api/pwa-images/status').set('Authorization', `Bearer ${a.token}`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });

  dbTest('upload → download returns the same bytes', async () => {
    const a = await newOwner('Img Shop A2');
    const fileId = `img-test-${Date.now()}`;
    const up = await request(app).post(`/api/pwa-images/${fileId}`).set('Authorization', `Bearer ${a.token}`).attach('file', PNG, { filename: 'p.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    const dl = await request(app).get(`/api/pwa-images/${fileId}`).set('Authorization', `Bearer ${a.token}`).buffer(true).parse((res, cb) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(dl.status).toBe(200);
    expect(Buffer.compare(dl.body, PNG)).toBe(0);
  });

  dbTest('another shop cannot read this shop’s image', async () => {
    const a = await newOwner('Img Shop A3');
    const b = await newOwner('Img Shop B3');
    const fileId = `img-test-iso-${Date.now()}`;
    await request(app).post(`/api/pwa-images/${fileId}`).set('Authorization', `Bearer ${a.token}`).attach('file', PNG, { filename: 'p.png', contentType: 'image/png' });
    const bDl = await request(app).get(`/api/pwa-images/${fileId}`).set('Authorization', `Bearer ${b.token}`);
    expect(bDl.status).toBe(404);
  });

  dbTest('rejects a non-image type', async () => {
    const a = await newOwner('Img Shop A4');
    const res = await request(app).post(`/api/pwa-images/img-test-bad-${Date.now()}`).set('Authorization', `Bearer ${a.token}`).attach('file', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  dbTest('requires a token', async () => {
    const res = await request(app).get('/api/pwa-images');
    expect(res.status).toBe(401);
  });
});
