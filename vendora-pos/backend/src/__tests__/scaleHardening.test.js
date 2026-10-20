'use strict';

// Unit tests for the scale-hardening helpers that need no database:
//  - rate-limit keying (per-shop when a valid PWA token is present; email+IP for auth; IP otherwise)
//  - the sync ETag (stable, order-independent, changes when any visible rev bumps)
const jwt = require('jsonwebtoken');
const config = require('../config');
const {
  shopKeyFromToken, ipKey, shopOrIpKey, emailIpKey, emailOnlyKey, emailForKey,
  loginEmailLimiter, registerEmailLimiter,
} = require('../middleware/rateLimit');
const sync = require('../services/pwaSyncService');

function pwaToken(shopId, extra = {}) {
  return jwt.sign({ sub: shopId, shopId, role: 'owner', typ: 'pwa', ...extra }, config.jwt.secret, { expiresIn: '15m' });
}

describe('rate-limit keying (scale)', () => {
  test('a valid PWA token keys by shop, so a shop\'s many devices share ONE per-shop bucket', () => {
    const token = pwaToken('shopA');
    const reqPhone1 = { headers: { authorization: `Bearer ${token}` }, ip: '1.2.3.4' };
    const reqPhone2 = { headers: { authorization: `Bearer ${token}` }, ip: '5.6.7.8' }; // different device/IP
    expect(shopKeyFromToken(reqPhone1)).toBe('shop:shopA');
    expect(shopOrIpKey(reqPhone1)).toBe('shop:shopA');
    expect(shopOrIpKey(reqPhone2)).toBe('shop:shopA'); // same shop key regardless of IP
  });

  test('two different shops get different buckets', () => {
    const a = { headers: { authorization: `Bearer ${pwaToken('shopA')}` }, ip: '1.1.1.1' };
    const b = { headers: { authorization: `Bearer ${pwaToken('shopB')}` }, ip: '1.1.1.1' };
    expect(shopOrIpKey(a)).not.toBe(shopOrIpKey(b));
  });

  test('a forged/invalid token falls back to the IP key (can\'t borrow another shop\'s bucket)', () => {
    const forged = jwt.sign({ shopId: 'victim', typ: 'pwa' }, 'not-the-secret');
    const req = { headers: { authorization: `Bearer ${forged}` }, ip: '9.9.9.9' };
    expect(shopKeyFromToken(req)).toBeNull();
    expect(shopOrIpKey(req)).toBe('9.9.9.9');
  });

  test('no token → IP key; IPv6 is grouped to a /64', () => {
    expect(shopOrIpKey({ headers: {}, ip: '203.0.113.5' })).toBe('203.0.113.5');
    expect(ipKey({ ip: '2001:db8:1234:5678:9abc:def0:1:2' })).toBe('2001:db8:1234:5678::/64');
  });

  test('auth limiter keys by email+IP (shared IP, distinct emails = distinct buckets)', () => {
    const k1 = emailIpKey({ body: { email: 'A@Shop.com' }, ip: '1.2.3.4' });
    const k2 = emailIpKey({ body: { email: 'b@shop.com' }, ip: '1.2.3.4' });
    expect(k1).toBe('a@shop.com|1.2.3.4'); // lower-cased
    expect(k1).not.toBe(k2);
    expect(emailIpKey({ body: {}, ip: '1.2.3.4' })).toBe('anon|1.2.3.4');
  });

  test('credential routes also cap per-IP (across all emails) and per-email (across all IPs)', () => {
    // per-IP key ignores email → one IP trying many emails shares ONE bucket (stops credential stuffing)
    const ipA = ipKey({ ip: '1.2.3.4' });
    expect(emailIpKey({ body: { email: 'x@a.com' }, ip: '1.2.3.4' })).not.toBe(ipA); // email|ip is a different axis
    // per-email key ignores IP → guessing one account from many IPs shares ONE bucket
    const fromHome = emailOnlyKey({ body: { email: 'Owner@Shop.com' }, ip: '1.1.1.1' });
    const fromCafe = emailOnlyKey({ body: { email: 'owner@shop.com' }, ip: '2.2.2.2' });
    expect(fromHome).toBe('email:owner@shop.com');
    expect(fromHome).toBe(fromCafe);                 // same account, different IPs → same bucket
    expect(emailOnlyKey({ body: {}, ip: '9.9.9.9' })).toBe('9.9.9.9'); // no email → falls back to IP
  });

  test('email key is length-bounded so a huge email can\'t bloat the limiter store (M2)', () => {
    const huge = `${'a'.repeat(5000)}@x.com`;
    expect(emailForKey({ body: { email: huge } }).length).toBeLessThanOrEqual(254);
    expect(emailOnlyKey({ body: { email: huge }, ip: '1.2.3.4' }).length).toBeLessThanOrEqual(260);
  });

  test('register has its OWN per-email limiter instance (separate bucket from login) (M1)', () => {
    // Distinct rateLimit instances → distinct stores, so invalid registrations can't drain login's budget.
    expect(registerEmailLimiter).toBeDefined();
    expect(loginEmailLimiter).toBeDefined();
    expect(registerEmailLimiter).not.toBe(loginEmailLimiter);
  });
});

describe('sync ETag (delta pull)', () => {
  const mk = (arr) => sync.etagFor(arr);

  test('is stable and independent of document order', () => {
    const a = mk([{ name: 'inventory_v1', rev: 3 }, { name: 'suppliers_v1', rev: 1 }]);
    const b = mk([{ name: 'suppliers_v1', rev: 1 }, { name: 'inventory_v1', rev: 3 }]);
    expect(a).toBe(b);
  });

  test('changes when any visible rev bumps', () => {
    const before = mk([{ name: 'inventory_v1', rev: 3 }]);
    const after = mk([{ name: 'inventory_v1', rev: 4 }]);
    expect(after).not.toBe(before);
  });

  test('is a weak validator (W/ prefix)', () => {
    expect(mk([{ name: 'x', rev: 1 }])).toMatch(/^W\/"/);
  });
});
