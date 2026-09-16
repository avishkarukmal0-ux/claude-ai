'use strict';

require('./setup');
const request = require('supertest');
const app = require('../app');
const CashDrawer = require('../models/CashDrawer');

let ownerToken;
let cashierToken;
const TILL_ID = 'TILL-TEST';

beforeAll(async () => {
  const ownerLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@test.com', password: 'password123', storeId: global.testStore._id.toString() });
  ownerToken = ownerLogin.body?.data?.accessToken || ownerLogin.body?.accessToken;

  const cashierLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'cashier@test.com', pin: '3333', storeId: global.testStore._id.toString() });
  cashierToken = cashierLogin.body?.data?.accessToken || cashierLogin.body?.accessToken;
});

describe('Cash Drawer Routes', () => {
  describe('GET /api/cash-drawer/state/:tillId', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get(`/api/cash-drawer/state/${TILL_ID}`);
      expect(res.status).toBe(401);
    });

    it('should return or create drawer state for a till', async () => {
      const res = await request(app)
        .get(`/api/cash-drawer/state/${TILL_ID}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const drawer = res.body?.data?.drawer || res.body?.drawer;
      expect(drawer).toBeDefined();
      expect(drawer.tillId).toBe(TILL_ID);
    });
  });

  describe('POST /api/cash-drawer/open-day', () => {
    it('should open day with float', async () => {
      const res = await request(app)
        .post('/api/cash-drawer/open-day')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tillId: TILL_ID, openingFloat: 150, notes: 'Morning opening test' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow cashier to open day', async () => {
      const res = await request(app)
        .post('/api/cash-drawer/open-day')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ tillId: 'TILL-CASHIER', openingFloat: 100 });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/cash-drawer/safe-drop', () => {
    it('should record a safe drop', async () => {
      const res = await request(app)
        .post('/api/cash-drawer/safe-drop')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tillId: TILL_ID, amount: 100, notes: 'Mid-day safe drop test' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject safe drop with zero amount', async () => {
      const res = await request(app)
        .post('/api/cash-drawer/safe-drop')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tillId: TILL_ID, amount: 0 });
      expect([400, 422]).toContain(res.status);
    });

    it('should reject safe drop with negative amount', async () => {
      const res = await request(app)
        .post('/api/cash-drawer/safe-drop')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tillId: TILL_ID, amount: -50 });
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('POST /api/cash-drawer/payout', () => {
    it('should record a payout', async () => {
      const res = await request(app)
        .post('/api/cash-drawer/payout')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tillId: TILL_ID, amount: 25, description: 'Window cleaning' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/cash-drawer/close-day', () => {
    it('should close the day with declared amount', async () => {
      const res = await request(app)
        .post('/api/cash-drawer/close-day')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          tillId: TILL_ID,
          declaredAmount: 150,
          denominations: {
            50: 1, 20: 2, 10: 1, 5: 2,
          },
        });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/cash-drawer/activity/:tillId/today', () => {
    it('should return today activity log', async () => {
      const res = await request(app)
        .get(`/api/cash-drawer/activity/${TILL_ID}/today`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      const activities = res.body?.data?.activities || res.body?.activities || [];
      expect(Array.isArray(activities)).toBe(true);
    });
  });

  describe('GET /api/cash-drawer/all — manager only', () => {
    it('should return all drawers for manager', async () => {
      const res = await request(app)
        .get('/api/cash-drawer/all')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      const drawers = res.body?.data?.drawers || res.body?.drawers;
      expect(Array.isArray(drawers)).toBe(true);
    });

    it('should reject cashier accessing all drawers', async () => {
      const res = await request(app)
        .get('/api/cash-drawer/all')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Shift Handover', () => {
    let handoverId;

    it('should initiate a shift handover', async () => {
      const res = await request(app)
        .post('/api/cash-drawer/handover/initiate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          tillId: TILL_ID,
          outgoingStaffId: global.testStaff.owner._id.toString(),
          incomingStaffId: global.testStaff.cashier._id.toString(),
        });
      expect([200, 201]).toContain(res.status);
      if (res.status === 200 || res.status === 201) {
        const handover = res.body?.data?.handover || res.body?.handover;
        if (handover) handoverId = handover._id;
      }
    });

    it('should be able to get pending handover', async () => {
      const res = await request(app)
        .get('/api/cash-drawer/handover/pending')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
    });
  });
});

describe('CashDrawer Model', () => {
  it('should create drawer via getDrawer static method', async () => {
    const drawer = await CashDrawer.getDrawer(global.testStore._id, 'TILL-MODEL-TEST');
    expect(drawer).toBeDefined();
    expect(drawer.tillId).toBe('TILL-MODEL-TEST');
    expect(drawer.store.toString()).toBe(global.testStore._id.toString());
  });

  it('should return existing drawer on second getDrawer call', async () => {
    const drawer1 = await CashDrawer.getDrawer(global.testStore._id, 'TILL-IDEMPOTENT');
    const drawer2 = await CashDrawer.getDrawer(global.testStore._id, 'TILL-IDEMPOTENT');
    expect(drawer1._id.toString()).toBe(drawer2._id.toString());
  });

  it('should calculate expected balance', async () => {
    const drawer = await CashDrawer.getDrawer(global.testStore._id, 'TILL-CALC');
    await drawer.recordCashSale(10.00);
    await drawer.recordCashSale(5.50);
    const balance = drawer.calculateExpected();
    expect(typeof balance).toBe('number');
  });

  it('should flag safe drop needed when excess exceeds threshold', async () => {
    const drawer = await CashDrawer.getDrawer(global.testStore._id, 'TILL-EXCESS');
    // Simulate high balance
    drawer.cashBalance = 400;
    drawer.targetFloat = 150;
    const needsDrop = drawer.needsSafeDrop();
    expect(needsDrop).toBe(true);
  });

  it('should not flag safe drop when balance is within threshold', async () => {
    const drawer = await CashDrawer.getDrawer(global.testStore._id, 'TILL-OK');
    drawer.cashBalance = 150;
    drawer.targetFloat = 150;
    const needsDrop = drawer.needsSafeDrop();
    expect(needsDrop).toBe(false);
  });
});
