'use strict';

require('./setup');
const request = require('supertest');
const app = require('../app');

let supervisorToken;
let cashierToken;
let ownerToken;

beforeAll(async () => {
  const ownerLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@test.com', password: 'password123', storeId: global.testStore._id.toString() });
  ownerToken = ownerLogin.body?.data?.accessToken || ownerLogin.body?.accessToken;

  // manager is supervisor-level
  const managerLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'manager@test.com', password: 'password123', storeId: global.testStore._id.toString() });
  supervisorToken = managerLogin.body?.data?.accessToken || managerLogin.body?.accessToken;

  const cashierLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'cashier@test.com', pin: '3333', storeId: global.testStore._id.toString() });
  cashierToken = cashierLogin.body?.data?.accessToken || cashierLogin.body?.accessToken;
});

describe('Loss Prevention Routes', () => {
  describe('GET /api/loss-prevention/dashboard', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/loss-prevention/dashboard');
      expect(res.status).toBe(401);
    });

    it('should reject cashier (insufficient role)', async () => {
      const res = await request(app)
        .get('/api/loss-prevention/dashboard')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
    });

    it('should allow supervisor to view dashboard', async () => {
      const res = await request(app)
        .get('/api/loss-prevention/dashboard')
        .set('Authorization', `Bearer ${supervisorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.noSalesToday).toBe('number');
    });

    it('should allow owner to view dashboard', async () => {
      const res = await request(app)
        .get('/api/loss-prevention/dashboard')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/loss-prevention/no-sales — log no-sale', () => {
    let noSaleLogId;

    it('should allow any staff to log a no-sale event', async () => {
      const res = await request(app)
        .post('/api/loss-prevention/no-sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ tillId: 'TILL-1', reason: 'customer_query' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const log = res.body?.data?.log || res.body?.log;
      expect(log).toBeDefined();
      expect(log.reason).toBe('customer_query');
      noSaleLogId = log?._id;
    });

    it('should log no-sale with custom reason', async () => {
      const res = await request(app)
        .post('/api/loss-prevention/no-sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ tillId: 'TILL-1', reason: 'other', customReason: 'Till check' });
      expect(res.status).toBe(201);
    });

    it('should allow supervisor to flag a no-sale', async () => {
      if (!noSaleLogId) return;
      const res = await request(app)
        .put(`/api/loss-prevention/no-sales/${noSaleLogId}/flag`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ flagReason: 'Suspicious timing' });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/loss-prevention/no-sales', () => {
    it('should allow supervisor to view no-sales log', async () => {
      const res = await request(app)
        .get('/api/loss-prevention/no-sales')
        .set('Authorization', `Bearer ${supervisorToken}`);
      expect(res.status).toBe(200);
      const logs = res.body?.data?.logs || res.body?.logs;
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject cashier from viewing no-sales log', async () => {
      const res = await request(app)
        .get('/api/loss-prevention/no-sales')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
    });

    it('should filter no-sales by flagged status', async () => {
      const res = await request(app)
        .get('/api/loss-prevention/no-sales?flagged=true')
        .set('Authorization', `Bearer ${supervisorToken}`);
      expect(res.status).toBe(200);
      const logs = res.body?.data?.logs || res.body?.logs;
      logs.forEach(l => expect(l.flagged).toBe(true));
    });
  });

  describe('GET /api/loss-prevention/scan-patterns', () => {
    it('should return scan patterns for supervisor', async () => {
      const res = await request(app)
        .get('/api/loss-prevention/scan-patterns')
        .set('Authorization', `Bearer ${supervisorToken}`);
      expect(res.status).toBe(200);
      const patterns = res.body?.data?.patterns || res.body?.patterns;
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('POST /api/loss-prevention/incidents — log incident', () => {
    let incidentId;

    it('should allow supervisor to log an incident', async () => {
      const res = await request(app)
        .post('/api/loss-prevention/incidents')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          type: 'shoplifting',
          severity: 'medium',
          description: 'Customer concealed item in bag, apprehended at exit',
          estimatedValue: 8.50,
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const incident = res.body?.data?.incident || res.body?.incident;
      expect(incident).toBeDefined();
      expect(incident.type).toBe('shoplifting');
      incidentId = incident?._id;
    });

    it('should log a high-severity incident', async () => {
      const res = await request(app)
        .post('/api/loss-prevention/incidents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          type: 'theft',
          severity: 'high',
          description: 'CCTV footage of organised theft ring',
          estimatedValue: 150.00,
        });
      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/loss-prevention/incidents', () => {
    it('should return list of incidents', async () => {
      const res = await request(app)
        .get('/api/loss-prevention/incidents')
        .set('Authorization', `Bearer ${supervisorToken}`);
      expect(res.status).toBe(200);
      const incidents = res.body?.data?.incidents || res.body?.incidents;
      expect(Array.isArray(incidents)).toBe(true);
      expect(incidents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/loss-prevention/watchlist', () => {
    it('should return watchlist for supervisor', async () => {
      const res = await request(app)
        .get('/api/loss-prevention/watchlist')
        .set('Authorization', `Bearer ${supervisorToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/loss-prevention/panic', () => {
    it('should trigger panic alert', async () => {
      const res = await request(app)
        .post('/api/loss-prevention/panic')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ tillId: 'TILL-1' });
      // Should accept and record panic (200 or 201)
      expect([200, 201]).toContain(res.status);
    });
  });
});
