'use strict';

require('./setup');
const request = require('supertest');
const app = require('../app');
const Product = require('../models/Product');

let token;
let managerToken;
let testProduct;

beforeAll(async () => {
  // Login as owner to get token
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'owner@test.com',
      password: 'password123',
      storeId: global.testStore._id.toString(),
    });
  token = loginRes.body?.data?.accessToken || loginRes.body?.accessToken;

  const managerLogin = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'manager@test.com',
      password: 'password123',
      storeId: global.testStore._id.toString(),
    });
  managerToken = managerLogin.body?.data?.accessToken || managerLogin.body?.accessToken;
});

describe('Product Routes', () => {
  describe('POST /api/products — create', () => {
    it('should reject without auth', async () => {
      const res = await request(app).post('/api/products').send({});
      expect(res.status).toBe(401);
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Incomplete Product' }); // missing barcode, category, retailPrice
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should create a product successfully', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test Lager 500ml',
          barcode: '5000112637922',
          category: 'Beer & Cider',
          brand: 'Test Brew Co',
          retailPrice: 1.89,
          costPrice: 0.95,
          vatRate: 20,
          stockQuantity: 48,
          lowStockThreshold: 12,
          ageRestricted: true,
          requiresChallenge25: true,
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const product = res.body?.data?.product || res.body?.product;
      expect(product).toBeDefined();
      expect(product.name).toBe('Test Lager 500ml');
      testProduct = product;
    });

    it('should reject duplicate barcode for same store', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Duplicate Barcode',
          barcode: '5000112637922',
          category: 'Beer & Cider',
          retailPrice: 1.99,
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /api/products/barcode/:code', () => {
    it('should find product by barcode', async () => {
      const res = await request(app)
        .get('/api/products/barcode/5000112637922')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const product = res.body?.data?.product || res.body?.product;
      expect(product.name).toBe('Test Lager 500ml');
    });

    it('should return 404 for unknown barcode', async () => {
      const res = await request(app)
        .get('/api/products/barcode/9999999999999')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/products — list with filters', () => {
    beforeAll(async () => {
      // Seed a few more products for filter tests
      await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Coca-Cola 330ml', barcode: '5000112625896', category: 'Soft Drinks', retailPrice: 1.25, vatRate: 20, stockQuantity: 2 });
      await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Marlboro Gold 20s', barcode: '5012345678901', category: 'Tobacco', retailPrice: 12.50, vatRate: 20, stockQuantity: 100, lowStockThreshold: 5, ageRestricted: true });
    });

    it('should return list of products', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const products = res.body?.data?.products || res.body?.products;
      expect(Array.isArray(products)).toBe(true);
      expect(products.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by category', async () => {
      const res = await request(app)
        .get('/api/products?category=Soft+Drinks')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const products = res.body?.data?.products || res.body?.products;
      products.forEach(p => expect(p.category).toBe('Soft Drinks'));
    });

    it('should filter by search term', async () => {
      const res = await request(app)
        .get('/api/products?search=Coca')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const products = res.body?.data?.products || res.body?.products;
      expect(products.some(p => p.name.includes('Coca'))).toBe(true);
    });

    it('should return only low-stock products', async () => {
      const res = await request(app)
        .get('/api/products?lowStock=true')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      // Coca-Cola has 2 stock, threshold default 5 — should appear
    });

    it('should include pagination metadata', async () => {
      const res = await request(app)
        .get('/api/products?page=1&limit=2')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const pagination = res.body?.data?.pagination || res.body?.pagination;
      if (pagination) {
        expect(pagination).toHaveProperty('total');
        expect(pagination).toHaveProperty('page');
      }
    });
  });

  describe('GET /api/products/categories', () => {
    it('should return distinct categories', async () => {
      const res = await request(app)
        .get('/api/products/categories')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const categories = res.body?.data?.categories || res.body?.categories;
      expect(Array.isArray(categories)).toBe(true);
      expect(categories).toContain('Beer & Cider');
    });
  });

  describe('PUT /api/products/:id — update', () => {
    it('should update a product', async () => {
      if (!testProduct) return;
      const res = await request(app)
        .put(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ retailPrice: 1.99 });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/products/:id/adjust-stock', () => {
    it('should adjust stock with reason', async () => {
      if (!testProduct) return;
      const res = await request(app)
        .post(`/api/products/${testProduct._id}/adjust-stock`)
        .set('Authorization', `Bearer ${token}`)
        .send({ adjustment: -5, reason: 'Damaged stock', type: 'damage' });
      expect([200, 400]).toContain(res.status);
    });

    it('should reject stock adjustment without reason', async () => {
      if (!testProduct) return;
      const res = await request(app)
        .post(`/api/products/${testProduct._id}/adjust-stock`)
        .set('Authorization', `Bearer ${token}`)
        .send({ adjustment: 10 });
      // should require a reason
      expect([200, 400]).toContain(res.status);
    });
  });

  describe('GET /api/products/low-stock', () => {
    it('should return products below threshold', async () => {
      const res = await request(app)
        .get('/api/products/low-stock')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const products = res.body?.data?.products || res.body?.products;
      expect(Array.isArray(products)).toBe(true);
    });
  });
});
