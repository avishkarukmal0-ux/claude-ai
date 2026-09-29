'use strict';

// Integration tests for shop isolation + void authorisation (findings 3B, 3C).
// These need a real/ephemeral MongoDB. They run when VENDORA_TEST_URI is set (CI); otherwise
// they are explicitly SKIPPED (not silently passed) — run `npm run test:unit` for DB-free logic.
require('./setup');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const Store = require('../models/Store');
const Staff = require('../models/Staff');

const dbTest = process.env.VENDORA_TEST_URI ? test : test.skip;

async function login(email, password, storeId) {
  const res = await request(app).post('/api/auth/login').send({ email, password, storeId });
  return res.body?.data?.accessToken || res.body?.accessToken;
}

describe('refund shop isolation (3B)', () => {
  dbTest('a shop cannot refund another shop’s sale', async () => {
    const ownerToken = await login('owner@test.com', 'password123', global.testStore._id.toString());

    // Create a product + completed sale in store A.
    const prod = await request(app).post('/api/products').set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Iso Beans', barcode: '5000111000011', category: 'Grocery', retailPrice: 1, vatRate: 0, stockQuantity: 10 });
    const productId = (prod.body?.data?.product || prod.body?.product)?._id;

    const sale = await request(app).post('/api/sales').set('Authorization', `Bearer ${ownerToken}`)
      .send({ items: [{ productId, quantity: 2 }], payments: [{ method: 'cash', amount: 2 }] });
    const saleId = (sale.body?.sale?._id) || sale.body?.data?.sale?._id;
    expect(saleId).toBeTruthy();

    // Store B with its own owner.
    const storeB = await Store.create({ name: 'Store B', address: { line1: '2 B St', city: 'Leeds', postcode: 'LS1 1AA' }, isActive: true });
    await Staff.create({
      store: storeB._id, employeeId: 'B001', displayName: 'B Owner', firstName: 'B', lastName: 'Owner',
      email: 'ownerb@test.com', password: await bcrypt.hash('password123', 10), role: 'owner', status: 'active',
      permissions: { canRefund: true, canVoid: true },
    });
    const tokenB = await login('ownerb@test.com', 'password123', storeB._id.toString());

    // B tries to refund A's sale → must be rejected (not found for B's scope).
    const res = await request(app).post(`/api/sales/${saleId}/refund`).set('Authorization', `Bearer ${tokenB}`)
      .send({ items: [{ productId, quantity: 1 }], reason: 'test' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body?.success).toBeFalsy();
  });

  dbTest('the same items cannot be refunded twice (excessive/duplicate)', async () => {
    const ownerToken = await login('owner@test.com', 'password123', global.testStore._id.toString());
    const prod = await request(app).post('/api/products').set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Dup Cola', barcode: '5000111000028', category: 'Grocery', retailPrice: 1, vatRate: 0, stockQuantity: 10 });
    const productId = (prod.body?.data?.product || prod.body?.product)?._id;
    const sale = await request(app).post('/api/sales').set('Authorization', `Bearer ${ownerToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'cash', amount: 1 }] });
    const saleId = (sale.body?.sale?._id) || sale.body?.data?.sale?._id;

    const first = await request(app).post(`/api/sales/${saleId}/refund`).set('Authorization', `Bearer ${ownerToken}`)
      .send({ items: [{ productId, quantity: 1 }], reason: 'ok' });
    expect(first.status).toBeLessThan(400);

    const second = await request(app).post(`/api/sales/${saleId}/refund`).set('Authorization', `Bearer ${ownerToken}`)
      .send({ items: [{ productId, quantity: 1 }], reason: 'again' });
    expect(second.status).toBeGreaterThanOrEqual(400); // nothing left to refund
  });
});

describe('void authorisation (3C)', () => {
  dbTest('void is rejected when a supervisor PIN is required but omitted', async () => {
    const ownerToken = await login('owner@test.com', 'password123', global.testStore._id.toString());
    await Store.findByIdAndUpdate(global.testStore._id, { 'settings.requirePinForVoid': true });

    const prod = await request(app).post('/api/products').set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Void Milk', barcode: '5000111000035', category: 'Grocery', retailPrice: 1, vatRate: 0, stockQuantity: 10 });
    const productId = (prod.body?.data?.product || prod.body?.product)?._id;
    const sale = await request(app).post('/api/sales').set('Authorization', `Bearer ${ownerToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'cash', amount: 1 }] });
    const saleId = (sale.body?.sale?._id) || sale.body?.data?.sale?._id;

    const res = await request(app).post(`/api/sales/${saleId}/void`).set('Authorization', `Bearer ${ownerToken}`)
      .send({ voidReason: 'no pin supplied' });
    expect(res.status).toBeGreaterThanOrEqual(400); // must NOT be allowed without the PIN
    expect(res.body?.success).toBeFalsy();

    await Store.findByIdAndUpdate(global.testStore._id, { 'settings.requirePinForVoid': false });
  });
});
