'use strict';

// Unit tests for the scale-hardening helpers that need no database:
//  - rate-limit keying (per-shop when a valid PWA token is present; email+IP for auth; IP otherwise)
//  - the sync ETag (stable, order-independent, changes when any visible rev bumps)
const jwt = require('jsonwebtoken');
const config = require('../config');
const { shopKeyFromToken, ipKey, shopOrIpKey, emailIpKey } = require('../middleware/rateLimit');
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
