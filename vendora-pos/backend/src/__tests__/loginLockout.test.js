'use strict';

// Login-lockout bounding + keying (audit M1/M2), exercised WITHOUT a database by mocking the Account/Member
// models so every login attempt is a miss (→ a recorded failure). A small LOCKOUT_MAX_ENTRIES cap is set
// before the service loads so the hard bound is testable cheaply.
process.env.PWA_LOGIN_LOCKOUT_MAX_ENTRIES = '5';
process.env.PWA_LOGIN_LOCKOUT_MAX = '10';
process.env.PWA_LOGIN_LOCKOUT_MINUTES = '15';

jest.mock('../models/Account', () => ({ findOne: () => Promise.resolve(null) }));
jest.mock('../models/Member', () => ({ findOne: () => Promise.resolve(null), ROLES: ['manager', 'staff'] }));

const svc = require('../services/pwaAuthService');

const LOCKOUT_MS = 15 * 60 * 1000;
beforeEach(() => svc.__clearLoginLockout());

async function fail(email, ip) {
  try { await svc.login({ email, password: 'wrong' }, { ip }); return null; }
  catch (e) { return e; }
}

describe('login lockout — keying (email+IP) and bounds', () => {
  test('locks one email+IP after 10 failures; the SAME email from another IP is NOT locked out (M1/C)', async () => {
    const email = 'victim@shop.com';
    for (let i = 0; i < 10; i += 1) {
      const e = await fail(email, '1.1.1.1');
      expect(e.statusCode).toBe(401); // invalid credentials, not yet locked
    }
    const locked = await fail(email, '1.1.1.1');
    expect(locked.statusCode).toBe(429); // 11th from that source → locked
    expect(locked.errorCode).toBe('ACCOUNT_LOCKED');
    // The real owner logging in from a DIFFERENT network is unaffected (remote attacker can't lock them out).
    const other = await fail(email, '9.9.9.9');
    expect(other.statusCode).toBe(401);
  });

  test('rejects an over-length email before doing any work (M2) and stores no key for it', async () => {
    const huge = `${'a'.repeat(300)}@x.com`;
    const e = await fail(huge, '1.1.1.1');
    expect(e.statusCode).toBe(422);        // validation, not a 401/lockout path
    expect(svc.__lockoutSize()).toBe(0);   // no giant key inserted
  });

  test('sweepLockouts drops entries once their lock has expired and the window passed (M2)', async () => {
    for (let i = 0; i < 10; i += 1) await fail('a@x.com', '1.1.1.1'); // → locked, 1 entry
    expect(svc.__lockoutSize()).toBe(1);
    svc.sweepLockouts(Date.now());                 // still locked → kept
    expect(svc.__lockoutSize()).toBe(1);
    svc.sweepLockouts(Date.now() + LOCKOUT_MS * 3); // lock expired + window passed → dropped
    expect(svc.__lockoutSize()).toBe(0);
  });

  test('the failure map is hard-bounded under a flood of unique keys (M2)', async () => {
    for (let i = 0; i < 40; i += 1) await fail(`u${i}@x.com`, `10.0.0.${i}`); // 40 distinct keys, cap is 5
    expect(svc.__lockoutSize()).toBeLessThanOrEqual(5);
  });
});
