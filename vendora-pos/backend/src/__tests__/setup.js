'use strict';

// The DB-backed suites here exercise the till API (auth, sales, refunds, …), so enable the till before
// app/config load. Production defaults TILL_ENABLED off; self-contained suites (e.g. pwaAuth) that don't
// require this setup keep the till gated. Must be set before any require that pulls in ../config.
process.env.TILL_ENABLED = process.env.TILL_ENABLED || 'true';

/**
 * Test Setup
 *
 * Uses mongodb-memory-server for integration tests.
 * Set VENDORA_TEST_URI env var to connect to a real MongoDB instance
 * (e.g. in CI or Docker: VENDORA_TEST_URI=mongodb://localhost:27017/vendora_test).
 * When that's not set and no local MongoDB binary is found, tests that
 * require DB will be skipped automatically via the skipIfNoDb helper.
 */

const mongoose = require('mongoose');

let dbReady = false;
let dbError = null;

// Allow override via env for CI
const TEST_URI = process.env.VENDORA_TEST_URI;

async function tryConnect() {
  if (TEST_URI) {
    await mongoose.connect(TEST_URI);
    dbReady = true;
    return;
  }

  // Try MongoMemoryServer (needs a binary; downloads on first run). Bounded so a sandbox
  // without a binary or network FAILS FAST (→ suites skip) instead of hanging the run.
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const timeout = new Promise((_, reject) => setTimeout(
      () => reject(new Error('mongodb-memory-server unavailable (no binary / offline)')), 20000,
    ));
    const mongod = await Promise.race([MongoMemoryServer.create(), timeout]);
    global.__MONGOD__ = mongod;
    await mongoose.connect(mongod.getUri());
    dbReady = true;
  } catch (err) {
    dbError = err.message;
    dbReady = false;
    // eslint-disable-next-line no-console
    console.warn(`\n⚠  Integration DB unavailable — DB-backed suites will be skipped: ${dbError}`);
    console.warn('   To run them, start MongoDB and set VENDORA_TEST_URI, or run "npm run test:unit" for DB-free tests.\n');
  }
}

beforeAll(async () => {
  await tryConnect();
  if (dbReady) await seedTestData();
}, 60000);

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (global.__MONGOD__) {
    await global.__MONGOD__.stop();
  }
});

async function seedTestData() {
  const bcrypt = require('bcryptjs');
  const Store = require('../models/Store');
  const Staff = require('../models/Staff');

  const store = await Store.create({
    name: 'Test Store',
    vatNumber: 'GB123456789',
    address: { line1: '1 Test Street', city: 'London', postcode: 'E1 1AA' },
    isActive: true,
  });
  global.testStore = store;

  const pin1111 = await bcrypt.hash('1111', 10);
  const pin2222 = await bcrypt.hash('2222', 10);
  const pin3333 = await bcrypt.hash('3333', 10);
  const pw = await bcrypt.hash('password123', 10);

  global.testStaff = {};

  global.testStaff.owner = await Staff.create({
    store: store._id,
    employeeId: 'EMP001',
    displayName: 'Test Owner',
    firstName: 'Test',
    lastName: 'Owner',
    email: 'owner@test.com',
    pin: pin1111,
    password: pw,
    role: 'owner',
    status: 'active',
    permissions: {
      canVoid: true, canRefund: true, canDiscount: true,
      canViewReports: true, canManageStaff: true, canManageProducts: true,
      canOpenDrawer: true,
    },
  });

  global.testStaff.manager = await Staff.create({
    store: store._id,
    employeeId: 'EMP002',
    displayName: 'Test Manager',
    firstName: 'Test',
    lastName: 'Manager',
    email: 'manager@test.com',
    pin: pin2222,
    password: pw,
    role: 'manager',
    status: 'active',
    permissions: {
      canVoid: true, canRefund: true, canDiscount: true,
      canViewReports: true, canOpenDrawer: true,
    },
  });

  global.testStaff.cashier = await Staff.create({
    store: store._id,
    employeeId: 'EMP003',
    displayName: 'Test Cashier',
    firstName: 'Test',
    lastName: 'Cashier',
    email: 'cashier@test.com',
    pin: pin3333,
    role: 'cashier',
    status: 'active',
    permissions: { canOpenDrawer: true },
  });

  global.testTokens = {};
}

// Utility: skip a test suite if DB isn't available
global.requireDb = () => {
  if (!dbReady) {
    test.skip('DB not available — skipping test (set VENDORA_TEST_URI to run)', () => {});
    return false;
  }
  return true;
};

global.skipIfNoDb = (fn) => {
  if (!dbReady) {
    return test.skip(`DB not available: ${dbError || 'no binary'}`, () => {});
  }
  return fn();
};

global.dbReady = () => dbReady;
