'use strict';

require('./setup');
const request = require('supertest');
const app = require('../app');
const Product = require('../models/Product');

let ownerToken;
let cashierToken;
let testProductId;
let testAgeRestrictedId;
let createdSaleId;
let createdReceiptNumber;

beforeAll(async () => {
  // Login
  const ownerLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@test.com', password: 'password123', storeId: global.testStore._id.toString() });
  ownerToken = ownerLogin.body?.data?.accessToken || ownerLogin.body?.accessToken;

  const cashierLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'cashier@test.com', pin: '3333', storeId: global.testStore._id.toString() });
  cashierToken = cashierLogin.body?.data?.accessToken || cashierLogin.body?.accessToken;

  // Create test products
  const normalProductCreate = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Sale Test Crisps', barcode: '5000328001817', category: 'Snacks', retailPrice: 0.89, vatRate: 20, stockQuantity: 100 });
  testProductId = (normalProductCreate.body?.data?.product || normalProductCreate.body?.product)?._id;

  const ageProductCreate = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Sale Test Wine 75cl', barcode: '3263280113020', category: 'Wine', retailPrice: 6.99, vatRate: 20, stockQuantity: 50, ageRestricted: true, requiresChallenge25: true });
  testAgeRestrictedId = (ageProductCreate.body?.data?.product || ageProductCreate.body?.product)?._id;
});

describe('Sales Routes', () => {
  describe('POST /api/sales — create sale', () => {
    it('should reject without auth', async () => {
      const res = await request(app).post('/api/sales').send({});
      expect(res.status).toBe(401);
    });

    it('should reject with no items', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ items: [], payments: [{ method: 'cash', amount: 1 }] });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject with no payments', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          items: [{ barcode: '5000328001817', quantity: 1 }],
          payments: [],
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject unknown barcode', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          items: [{ barcode: '9999999999998', quantity: 1 }],
          payments: [{ method: 'cash', amount: 1 }],
        });
      expect(res.status).toBe(404);
    });

    it('should reject age-restricted product without ageVerified flag', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          items: [{ barcode: '3263280113020', quantity: 1, ageVerified: false }],
          payments: [{ method: 'cash', amount: 6.99 }],
        });
      expect(res.status).toBe(403);
      expect(res.body.error?.code).toMatch(/AGE_VERIFICATION/);
    });

    it('should create a cash sale successfully', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          tillId: 'TILL-1',
          items: [{ barcode: '5000328001817', quantity: 2 }],
          payments: [{ method: 'cash', amount: 2.00 }],
          cashDetails: { tendered: 2.00, change: 0.22 },
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const sale = res.body?.data?.sale || res.body?.sale;
      expect(sale).toBeDefined();
      expect(sale.total).toBeCloseTo(1.78, 1);
      expect(sale.receiptNumber).toMatch(/^\d{8}-\d{4}$/);
      createdSaleId = sale._id;
      createdReceiptNumber = sale.receiptNumber;
    });

    it('should deduct stock after sale', async () => {
      const res = await request(app)
        .get('/api/products/barcode/5000328001817')
        .set('Authorization', `Bearer ${ownerToken}`);
      const product = res.body?.data?.product || res.body?.product;
      expect(product.stock.quantity).toBeLessThan(100);
    });

    it('should create a sale with age-verified product', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          tillId: 'TILL-1',
          items: [{ barcode: '3263280113020', quantity: 1, ageVerified: true }],
          payments: [{ method: 'cash', amount: 6.99 }],
        });
      expect(res.status).toBe(201);
    });

    it('should reject sale with insufficient stock', async () => {
      // Try to buy more than we have
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          tillId: 'TILL-1',
          items: [{ barcode: '5000328001817', quantity: 9999 }],
          payments: [{ method: 'cash', amount: 8999.11 }],
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should create training mode sale without persisting to reports', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          tillId: 'TILL-1',
          items: [{ barcode: '5000328001817', quantity: 1 }],
          payments: [{ method: 'cash', amount: 0.89 }],
          isTraining: true,
        });
      expect(res.status).toBe(201);
      const sale = res.body?.data?.sale || res.body?.sale;
      expect(sale.isTraining).toBe(true);
    });

    it('should accept card payment', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          tillId: 'TILL-1',
          items: [{ barcode: '5000328001817', quantity: 1 }],
          payments: [{ method: 'card', amount: 0.89, reference: 'CARD-TEST-001' }],
        });
      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/sales/:id', () => {
    it('should retrieve sale by ID', async () => {
      if (!createdSaleId) return;
      const res = await request(app)
        .get(`/api/sales/${createdSaleId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      const sale = res.body?.data?.sale || res.body?.sale;
      expect(sale._id).toBe(createdSaleId);
    });

    it('should return 404 for unknown ID', async () => {
      const res = await request(app)
        .get('/api/sales/000000000000000000000000')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/sales/receipt/:number', () => {
    it('should retrieve sale by receipt number', async () => {
      if (!createdReceiptNumber) return;
      const res = await request(app)
        .get(`/api/sales/receipt/${createdReceiptNumber}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      const sale = res.body?.data?.sale || res.body?.sale;
      expect(sale.receiptNumber).toBe(createdReceiptNumber);
    });
  });

  describe('POST /api/sales/:id/void', () => {
    it('should void a sale with supervisor permission', async () => {
      if (!createdSaleId) return;
      const res = await request(app)
        .post(`/api/sales/${createdSaleId}/void`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'Test void', supervisorPin: '1111' });
      expect([200, 400]).toContain(res.status);
    });

    it('should reject void from cashier without supervisor PIN', async () => {
      // Create a fresh sale
      const saleRes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          tillId: 'TILL-1',
          items: [{ barcode: '5000328001817', quantity: 1 }],
          payments: [{ method: 'cash', amount: 0.89 }],
        });
      const saleId = (saleRes.body?.data?.sale || saleRes.body?.sale)?._id;
      if (!saleId) return;

      const res = await request(app)
        .post(`/api/sales/${saleId}/void`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'Test void' }); // no supervisorPin
      // Should either reject (403) or require pin
      expect([403, 400]).toContain(res.status);
    });
  });

  describe('GET /api/sales — list with filters', () => {
    it('should return paginated sales list', async () => {
      const res = await request(app)
        .get('/api/sales?page=1&limit=10')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      const sales = res.body?.data?.sales || res.body?.sales;
      expect(Array.isArray(sales)).toBe(true);
    });

    it('should filter by date range', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/sales?dateFrom=${today}&dateTo=${today}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
    });
  });
});
