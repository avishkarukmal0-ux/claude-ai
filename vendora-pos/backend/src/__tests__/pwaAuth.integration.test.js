'use strict';

// Integration tests for PWA owner accounts (/api/pwa-auth) — infra Stage 2b.
//
// SELF-CONTAINED on purpose: it does NOT require('./setup') (which seeds Store/Staff with fixed unique
// ids that collide on a persistent Atlas DB). It connects to VENDORA_TEST_URI itself, uses only the
// database named in that URI (vendora_test), and cleans up only the accounts it creates. When
// VENDORA_TEST_URI is unset the whole suite is SKIPPED (not silently passed).
const mongoose = require('mongoose');
const request = require('supertest');

const URI = process.env.VENDORA_TEST_URI;
const dbTest = URI ? test : test.skip;

let app;
let Account;

beforeAll(async () => {
  if (!URI) return;
  await mongoose.connect(URI);
  app = require('../app');
  Account = require('../models/Account');
  await Account.deleteMany({ email: /pwa-int-test/i });
}, 60000);

afterAll(async () => {
  if (!URI) return;
  if (Account) await Account.deleteMany({ email: /pwa-int-test/i });
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const uniqueEmail = () => `pwa-int-test+${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;

describe('PWA auth — /api/pwa-auth', () => {
  dbTest('register creates an account and returns tokens + shop', async () => {
    const res = await request(app).post('/api/pwa-auth/register')
      .send({ email: uniqueEmail(), password: 'sup3rsecret', shopName: 'Corner Shop' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.shop).toMatchObject({ name: 'Corner Shop' });
    expect(res.body.shop.id).toBeTruthy();
  });

  dbTest('duplicate email is rejected (409)', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/pwa-auth/register').send({ email, password: 'sup3rsecret', shopName: 'A' });
    const res = await request(app).post('/api/pwa-auth/register').send({ email, password: 'sup3rsecret', shopName: 'B' });
    expect(res.status).toBe(409);
  });

  dbTest('login: correct password succeeds; wrong password and unknown email both fail the same way (401)', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/pwa-auth/register').send({ email, password: 'sup3rsecret', shopName: 'S' });

    const ok = await request(app).post('/api/pwa-auth/login').send({ email, password: 'sup3rsecret' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();

    const wrong = await request(app).post('/api/pwa-auth/login').send({ email, password: 'wrongwrong' });
    expect(wrong.status).toBe(401);

    const unknown = await request(app).post('/api/pwa-auth/login').send({ email: 'pwa-int-test+missing@example.com', password: 'whatever12' });
    expect(unknown.status).toBe(401); // same generic 401 — no account enumeration
  });

  dbTest('refresh issues a fresh access token; /me returns the shop', async () => {
    const email = uniqueEmail();
    const reg = await request(app).post('/api/pwa-auth/register').send({ email, password: 'sup3rsecret', shopName: 'Refresh Shop' });

    const ref = await request(app).post('/api/pwa-auth/refresh').send({ refreshToken: reg.body.refreshToken });
    expect(ref.status).toBe(200);
    expect(ref.body.token).toBeTruthy();

    const me = await request(app).get('/api/pwa-auth/me').set('Authorization', `Bearer ${reg.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.shop).toMatchObject({ name: 'Refresh Shop' });
  });

  dbTest('validation: short password and malformed email are rejected (400)', async () => {
    const short = await request(app).post('/api/pwa-auth/register').send({ email: uniqueEmail(), password: '123', shopName: 'X' });
    expect(short.status).toBe(400);
    const bad = await request(app).post('/api/pwa-auth/register').send({ email: 'notanemail', password: 'sup3rsecret', shopName: 'X' });
    expect(bad.status).toBe(400);
  });

  dbTest('/me rejects a missing or invalid token (401)', async () => {
    const none = await request(app).get('/api/pwa-auth/me');
    expect(none.status).toBe(401);
    const bad = await request(app).get('/api/pwa-auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(bad.status).toBe(401);
  });
});
