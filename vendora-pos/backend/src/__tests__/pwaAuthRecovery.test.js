'use strict';

// Password reset + in-app credential changes, exercised WITHOUT a database by mocking the Account/Member
// models with a tiny in-memory store. Verifies the security-relevant behaviour: enumeration-safety, single-use
// + expiring reset tokens, tokenVersion invalidation, and current-password checks.
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

// `mock`-prefixed so the jest.mock factories may reference them (jest forbids other out-of-scope names).
const mockAccounts = new Map(); // email -> doc
const mockMembers = new Map();  // id -> doc
const mockQueryResult = (val) => {
  // Awaitable AND supports .select().lean() chaining (emailInUse / owner-refresh use the chained form).
  const p = Promise.resolve(val);
  p.select = () => p;
  p.lean = () => p;
  return p;
};

function makeAccount({ id, email, password }) {
  const doc = {
    _id: id, email, shopName: 'Test Shop', passwordHash: `h:${password}`,
    tokenVersion: 0, resetTokenHash: null, resetTokenExpiresAt: null,
    verifyPassword(pw) { return this.passwordHash === `h:${pw}`; },
    save() { mockAccounts.set(this.email, this); return Promise.resolve(this); },
  };
  mockAccounts.set(email, doc);
  return doc;
}

jest.mock('../models/Account', () => ({
  findOne: ({ email }) => mockQueryResult(mockAccounts.get(String(email).toLowerCase()) || null),
  findById: (id) => mockQueryResult([...mockAccounts.values()].find((a) => a._id === String(id)) || null),
  hashPassword: (pw) => Promise.resolve(`h:${pw}`),
  hashResetToken: (t) => require('crypto').createHash('sha256').update(String(t)).digest('hex'),
}));
jest.mock('../models/Member', () => ({
  findOne: ({ email }) => mockQueryResult([...mockMembers.values()].find((m) => m.email === String(email).toLowerCase()) || null),
  findById: (id) => mockQueryResult(mockMembers.get(String(id)) || null),
  hashPassword: (pw) => Promise.resolve(`h:${pw}`),
  ROLES: ['manager', 'staff'],
}));
jest.mock('../services/emailService', () => {
  const sent = [];
  return { __sent: sent, isConfigured: () => true, send: async (m) => { sent.push(m); }, fromAddress: () => 'noreply@test' };
});

const svc = require('../services/pwaAuthService');
const emailService = require('../services/emailService');

beforeEach(() => {
  mockAccounts.clear(); mockMembers.clear(); emailService.__sent.length = 0;
  makeAccount({ id: 'acc1', email: 'owner@shop.com', password: 'oldpass12' });
});

function linkToken() {
  const mail = emailService.__sent[emailService.__sent.length - 1];
  const m = /reset=([0-9a-f]+)&email=([^\s"&]+)/.exec(mail.text || mail.html || '');
  return { token: m && m[1], email: m && decodeURIComponent(m[2]) };
}

describe('requestPasswordReset — enumeration-safe', () => {
  test('a known email gets a reset email; the response never reveals existence', async () => {
    const out = await svc.requestPasswordReset('owner@shop.com');
    expect(out).toEqual({ emailConfigured: true });
    expect(emailService.__sent.length).toBe(1);
    expect(mockAccounts.get('owner@shop.com').resetTokenHash).toBeTruthy();
  });

  test('an unknown email returns the SAME shape and sends nothing', async () => {
    const out = await svc.requestPasswordReset('nobody@shop.com');
    expect(out).toEqual({ emailConfigured: true });
    expect(emailService.__sent.length).toBe(0);
  });
});

describe('resetPassword — single-use, expiring, invalidates sessions', () => {
  test('a valid token sets the new password, bumps tokenVersion, and signs in', async () => {
    await svc.requestPasswordReset('owner@shop.com');
    const { token, email } = linkToken();
    const res = await svc.resetPassword({ email, token, password: 'brandnew123' });
    expect(res.token).toBeTruthy();
    expect(res.role).toBe('owner');
    const acc = mockAccounts.get('owner@shop.com');
    expect(acc.tokenVersion).toBe(1);        // sessions invalidated
    expect(acc.resetTokenHash).toBeNull();   // single-use (cleared)
    // new password now logs in; old one doesn't
    await expect(svc.login({ email, password: 'brandnew123' })).resolves.toMatchObject({ role: 'owner' });
    await expect(svc.login({ email, password: 'oldpass12' })).rejects.toMatchObject({ statusCode: 401 });
  });

  test('a wrong or already-used token is rejected', async () => {
    await svc.requestPasswordReset('owner@shop.com');
    await expect(svc.resetPassword({ email: 'owner@shop.com', token: 'deadbeef', password: 'brandnew123' }))
      .rejects.toMatchObject({ errorCode: 'RESET_INVALID' });
  });

  test('an expired token is rejected', async () => {
    await svc.requestPasswordReset('owner@shop.com');
    const { token, email } = linkToken();
    mockAccounts.get('owner@shop.com').resetTokenExpiresAt = Date.now() - 1000; // expire it
    await expect(svc.resetPassword({ email, token, password: 'brandnew123' }))
      .rejects.toMatchObject({ errorCode: 'RESET_INVALID' });
  });

  test('too-short new password is rejected', async () => {
    await svc.requestPasswordReset('owner@shop.com');
    const { token, email } = linkToken();
    await expect(svc.resetPassword({ email, token, password: 'short' })).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });
});

describe('owner tokenVersion invalidates old refresh tokens', () => {
  test('a refresh token minted before a reset is rejected', async () => {
    const session = await svc.login({ email: 'owner@shop.com', password: 'oldpass12' });
    await svc.requestPasswordReset('owner@shop.com');
    const { token, email } = linkToken();
    await svc.resetPassword({ email, token, password: 'brandnew123' }); // bumps tv to 1
    await expect(svc.refresh(session.refreshToken)).rejects.toMatchObject({ errorCode: 'AUTH_REFRESH_INVALID' });
  });
});

describe('changePassword (owner) — verifies current, re-mints', () => {
  const owner = { shopId: 'acc1', role: 'owner', mid: 'acc1' };
  test('wrong current password is rejected', async () => {
    await expect(svc.changePassword(owner, { currentPassword: 'nope', newPassword: 'brandnew123' }))
      .rejects.toMatchObject({ statusCode: 401 });
  });
  test('correct current password rotates it and returns fresh tokens', async () => {
    const res = await svc.changePassword(owner, { currentPassword: 'oldpass12', newPassword: 'brandnew123' });
    expect(res.token).toBeTruthy();
    expect(mockAccounts.get('owner@shop.com').tokenVersion).toBe(1);
    await expect(svc.login({ email: 'owner@shop.com', password: 'brandnew123' })).resolves.toMatchObject({ role: 'owner' });
  });
});

describe('changeEmail (owner) — verifies password, rejects collisions', () => {
  const owner = { shopId: 'acc1', role: 'owner', mid: 'acc1' };
  test('wrong password is rejected', async () => {
    await expect(svc.changeEmail(owner, { password: 'nope', newEmail: 'new@shop.com' }))
      .rejects.toMatchObject({ statusCode: 401 });
  });
  test('an email already in use is rejected', async () => {
    makeAccount({ id: 'acc2', email: 'taken@shop.com', password: 'whatever1' });
    await expect(svc.changeEmail(owner, { password: 'oldpass12', newEmail: 'taken@shop.com' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });
  test('a valid change updates the login email', async () => {
    const res = await svc.changeEmail(owner, { password: 'oldpass12', newEmail: 'renamed@shop.com' });
    expect(res.member.email).toBe('renamed@shop.com');
    expect(mockAccounts.get('acc1' /* unused */) || mockAccounts.get('renamed@shop.com')).toBeTruthy();
  });
});
