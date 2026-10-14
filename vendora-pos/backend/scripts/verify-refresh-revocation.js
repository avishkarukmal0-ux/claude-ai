'use strict';

/**
 * End-to-end check of the durable refresh-token blacklist — WITHOUT touching any real account.
 *
 *   node scripts/verify-refresh-revocation.js        (CLI: connects, runs, disconnects)
 *   const { run } = require('.../verify-refresh-revocation'); await run(log)   (in-process, assumes a live connection)
 *
 * Creates a THROWAWAY store + staff, logs in through authService (real refresh token), confirms a valid token
 * refreshes, then LOGS OUT and confirms the same refresh token is REJECTED and that a RevokedToken row exists
 * (hash only, future expiry for the TTL index). Everything it created is deleted in `finally`, pass or fail.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const authService = require('../src/services/authService');
const Store = require('../src/models/Store');
const Staff = require('../src/models/Staff');
const RevokedToken = require('../src/models/RevokedToken');

const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
// NEVER print any part of a token (not even a prefix) — a refresh token is a bearer credential. Report only
// its presence and length, which is enough to show "a token was issued" without leaking any of its bytes.
const redact = (t) => (t ? `(present, ${String(t).length} chars)` : '(none)');

/**
 * Run the verification against the CURRENT mongoose connection. `log(line)` receives each result line.
 * Returns { ok, lines }. Never throws for a test failure (only for an infra error).
 */
async function run(log = console.log) {
  const tag = `verify-revrevoke-${Date.now()}`;
  const lines = [];
  let ok = true;
  const step = (label, pass, extra = '') => {
    ok = ok && pass;
    const line = `${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`;
    lines.push(line); log(line);
  };

  let store; let staff; const hashes = [];
  try {
    store = await Store.create({ name: tag, vatNumber: 'GB000000000', address: { line1: '1 Verify Street', city: 'London', postcode: 'E1 1AA' }, isActive: true });
    staff = await Staff.create({
      store: store._id, employeeId: tag, displayName: 'Verify Bot', firstName: 'Verify', lastName: 'Bot',
      email: `${tag}@local.test`, pin: await bcrypt.hash('1111', 10), password: await bcrypt.hash('verify-pass-123', 10), role: 'owner', status: 'active',
    });

    const r0 = await authService.login(store._id.toString(), `${tag}@local.test`, 'verify-pass-123');
    step('login issues a refresh token', !!(r0 && r0.refreshToken), redact(r0 && r0.refreshToken));

    const r1 = await authService.refreshTokens(r0.refreshToken);
    step('a valid refresh token is accepted (rotates to a new pair)', !!(r1 && r1.refreshToken));
    hashes.push(sha256(r0.refreshToken));

    await authService.logout(r1.refreshToken);
    hashes.push(sha256(r1.refreshToken));
    const row = await RevokedToken.findOne({ tokenHash: sha256(r1.refreshToken) }).lean();
    step('logout records a RevokedToken row (hash only, future expiry)', !!row && row.expiresAt instanceof Date && row.expiresAt > new Date(), row ? `expiresAt=${row.expiresAt.toISOString()}` : 'no row');
    step('stored value is a hash, not the raw token', !!row && !JSON.stringify(row).includes(r1.refreshToken));

    let rejected = false;
    try { await authService.refreshTokens(r1.refreshToken); } catch { rejected = true; }
    step('the logged-out refresh token is rejected', rejected);
  } finally {
    if (hashes.length) { try { await RevokedToken.deleteMany({ tokenHash: { $in: hashes } }); } catch { /* ignore */ } }
    if (staff) { try { await Staff.deleteOne({ _id: staff._id }); } catch { /* ignore */ } }
    if (store) { try { await Store.deleteOne({ _id: store._id }); } catch { /* ignore */ } }
  }
  const result = ok ? 'RESULT: PASS — logout revokes the refresh token durably (no Redis needed).' : 'RESULT: FAIL';
  lines.push(result); log(result);
  return { ok, lines };
}

// CLI wrapper: manage the connection ourselves.
async function main() {
  require('dotenv').config();
  const config = require('../src/config');
  const uri = (config.mongodb && config.mongodb.uri) || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri);
  try { const { ok } = await run(console.log); process.exit(ok ? 0 : 1); }
  finally { await mongoose.disconnect(); }
}

module.exports = { run };
if (require.main === module) main().catch((e) => { console.error('verify-refresh-revocation error:', e.message); process.exit(1); });
