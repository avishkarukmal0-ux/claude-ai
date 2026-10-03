'use strict';

// Pure unit test — no DB. Covers finding 3D (missing production secrets must fail safely).
const { checkSecrets, isInsecure } = require('../config/validateSecrets');

describe('validateSecrets.isInsecure', () => {
  it('flags missing, short, and placeholder secrets', () => {
    expect(isInsecure(undefined)).toBe(true);
    expect(isInsecure('')).toBe(true);
    expect(isInsecure('a'.repeat(31))).toBe(true);            // too short
    expect(isInsecure('change-me-please-please-please-please')).toBe(true); // contains placeholder
    expect(isInsecure('vendora-dev-secret-fallback-xxxxxxxxxxxxx')).toBe(true);
  });

  it('accepts a strong 32+ char secret', () => {
    expect(isInsecure('a'.repeat(32))).toBe(false);
    expect(isInsecure(require('crypto').randomBytes(48).toString('hex'))).toBe(false);
  });
});

describe('validateSecrets.checkSecrets', () => {
  it('is FATAL in production when secrets are weak/missing', () => {
    const res = checkSecrets({ jwtSecret: '', jwtRefreshSecret: '', isProd: true });
    expect(res.ok).toBe(false);
    expect(res.fatal).toBe(true);
    expect(res.problems).toEqual(['JWT_SECRET', 'JWT_REFRESH_SECRET']);
  });

  it('is NOT fatal outside production (dev/test stays explicit and unblocked)', () => {
    const res = checkSecrets({ jwtSecret: '', jwtRefreshSecret: '', isProd: false });
    expect(res.ok).toBe(false);
    expect(res.fatal).toBe(false);
  });

  it('passes cleanly with strong secrets in production', () => {
    const res = checkSecrets({ jwtSecret: 'a'.repeat(40), jwtRefreshSecret: 'b'.repeat(40), isProd: true });
    expect(res.ok).toBe(true);
    expect(res.fatal).toBe(false);
    expect(res.problems).toEqual([]);
  });
});
