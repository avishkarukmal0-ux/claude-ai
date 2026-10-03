'use strict';

// Integration tests for PWA owner accounts (/api/pwa-auth) — infra Stage 2b.
//
// SELF-CONTAINED on purpose: it does NOT require('./setup') (which seeds Store/Staff with fixed unique
// ids that collide on a persistent Atlas DB). It connects to VENDORA_TEST_URI itself, uses only the
// database named in that URI (vendora_test), and cleans up only the accounts it creates. When
// VENDORA_TEST_URI is unset the whole suite is SKIPPED (not silently passed).
// Opt-in DNS fix for mongodb+srv SRV lookups on networks that refuse them (VENDORA_DNS_PUBLIC=1).
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

beforeAll(async () => {
  if (!URI) return;
  await mongoose.connect(URI);
  app = require('../app');
  Account = require('../models/Account');
  Member = require('../models/Member');
  await Member.deleteMany({ email: /pwa-int-test/i });
  await Account.deleteMany({ email: /pwa-int-test/i });
}, 60000);

afterAll(async () => {
  if (!URI) return;
  if (Member) await Member.deleteMany({ email: /pwa-int-test/i });
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

  dbTest('validation: short password and malformed email are rejected (422)', async () => {
    // AppError.validation → 422 Unprocessable Entity (the app's consistent validation contract).
    const short = await request(app).post('/api/pwa-auth/register').send({ email: uniqueEmail(), password: '123', shopName: 'X' });
    expect(short.status).toBe(422);
    const bad = await request(app).post('/api/pwa-auth/register').send({ email: 'notanemail', password: 'sup3rsecret', shopName: 'X' });
    expect(bad.status).toBe(422);
  });

  dbTest('/me rejects a missing or invalid token (401)', async () => {
    const none = await request(app).get('/api/pwa-auth/me');
    expect(none.status).toBe(401);
    const bad = await request(app).get('/api/pwa-auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(bad.status).toBe(401);
  });

  dbTest('owner token carries role owner; /me returns owner role', async () => {
    const reg = await request(app).post('/api/pwa-auth/register').send({ email: uniqueEmail(), password: 'sup3rsecret', shopName: 'Owner Shop' });
    expect(reg.body.role).toBe('owner');
    const me = await request(app).get('/api/pwa-auth/me').set('Authorization', `Bearer ${reg.body.token}`);
    expect(me.body.role).toBe('owner');
    expect(me.body.member).toMatchObject({ role: 'owner' });
  });
});

describe('PWA staff access — /api/pwa-auth/staff', () => {
  async function newOwner(shopName = 'Staff Shop') {
    const reg = await request(app).post('/api/pwa-auth/register').send({ email: uniqueEmail(), password: 'sup3rsecret', shopName });
    return { token: reg.body.token, id: reg.body.shop.id };
  }

  dbTest('owner adds a member; the member logs in with their role, scoped to the owner shop', async () => {
    const owner = await newOwner('Add Member Shop');
    const email = uniqueEmail();
    const add = await request(app).post('/api/pwa-auth/staff')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email, name: 'Sam Staff', role: 'staff', password: 'staffpass1' });
    expect(add.status).toBe(201);
    expect(add.body.member).toMatchObject({ name: 'Sam Staff', role: 'staff', email });

    const login = await request(app).post('/api/pwa-auth/login').send({ email, password: 'staffpass1' });
    expect(login.status).toBe(200);
    expect(login.body.role).toBe('staff');
    expect(login.body.shop.id).toBe(owner.id); // works inside the owner's one shop/workspace
    expect(login.body.member).toMatchObject({ name: 'Sam Staff', role: 'staff' });
  });

  dbTest('staff endpoints require the owner role (a member token is 403)', async () => {
    const owner = await newOwner('Gate Shop');
    const email = uniqueEmail();
    await request(app).post('/api/pwa-auth/staff').set('Authorization', `Bearer ${owner.token}`)
      .send({ email, name: 'Mgr', role: 'manager', password: 'mgrpass12' });
    const login = await request(app).post('/api/pwa-auth/login').send({ email, password: 'mgrpass12' });

    // Even a manager cannot manage staff — owner only.
    const list = await request(app).get('/api/pwa-auth/staff').set('Authorization', `Bearer ${login.body.token}`);
    expect(list.status).toBe(403);
    const add = await request(app).post('/api/pwa-auth/staff').set('Authorization', `Bearer ${login.body.token}`)
      .send({ email: uniqueEmail(), name: 'X', role: 'staff', password: 'password1' });
    expect(add.status).toBe(403);
  });

  dbTest('a member email already in use is rejected (409)', async () => {
    const owner = await newOwner('Dup Shop');
    const email = uniqueEmail();
    await request(app).post('/api/pwa-auth/staff').set('Authorization', `Bearer ${owner.token}`)
      .send({ email, name: 'A', role: 'staff', password: 'password1' });
    const again = await request(app).post('/api/pwa-auth/staff').set('Authorization', `Bearer ${owner.token}`)
      .send({ email, name: 'B', role: 'staff', password: 'password1' });
    expect(again.status).toBe(409);
  });

  dbTest('deactivating a member blocks login and refresh', async () => {
    const owner = await newOwner('Deactivate Shop');
    const email = uniqueEmail();
    const add = await request(app).post('/api/pwa-auth/staff').set('Authorization', `Bearer ${owner.token}`)
      .send({ email, name: 'Temp', role: 'staff', password: 'password1' });
    const login = await request(app).post('/api/pwa-auth/login').send({ email, password: 'password1' });
    const refreshToken = login.body.refreshToken;

    const patch = await request(app).patch(`/api/pwa-auth/staff/${add.body.member.id}`)
      .set('Authorization', `Bearer ${owner.token}`).send({ active: false });
    expect(patch.status).toBe(200);
    expect(patch.body.member.active).toBe(false);

    const relogin = await request(app).post('/api/pwa-auth/login').send({ email, password: 'password1' });
    expect(relogin.status).toBe(401);
    const refresh = await request(app).post('/api/pwa-auth/refresh').send({ refreshToken });
    expect(refresh.status).toBe(401);
  });

  dbTest('a role change takes effect on the member\'s next refresh', async () => {
    const owner = await newOwner('Role Change Shop');
    const email = uniqueEmail();
    const add = await request(app).post('/api/pwa-auth/staff').set('Authorization', `Bearer ${owner.token}`)
      .send({ email, name: 'Promote', role: 'staff', password: 'password1' });
    const login = await request(app).post('/api/pwa-auth/login').send({ email, password: 'password1' });
    expect(login.body.role).toBe('staff');

    await request(app).patch(`/api/pwa-auth/staff/${add.body.member.id}`)
      .set('Authorization', `Bearer ${owner.token}`).send({ role: 'manager' });
    const refresh = await request(app).post('/api/pwa-auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(200);
    expect(refresh.body.role).toBe('manager');
  });
});
