'use strict';

/**
 * End-to-end check of the durable refresh-token blacklist — WITHOUT touching any real account.
 *
 *   node scripts/verify-refresh-revocation.js
 *
 * It creates a THROWAWAY store + staff member, logs in through authService (a real login → real refresh token),
 * confirms a valid token refreshes, then LOGS OUT and confirms the same refresh token is now REJECTED and that a
 * RevokedToken row exists (hash only, future expiry for the TTL index). Everything it created — the temp staff,
 * the temp store, and any RevokedToken rows — is deleted in `finally`, pass or fail. Reads MONGODB_URI from the
 * env (same as the server), so run it in the Render shell. Prints PASS/FAIL and exits non-zero on any failure.
 */
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const config = require('../src/config');
const authService = require('../src/services/authService');
const Store = require('../src/models/Store');
const Staff = require('../src/models/Staff');
const RevokedToken = require('../src/models/RevokedToken');

const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const redact = (t) => (t ? `${String(t).slice(0, 12)}…(${String(t).length} chars)` : '(none)');

async function main() {
  const uri = (config.mongodb && config.mongodb.uri) || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri);

  const tag = `verify-revrevoke-${Date.now()}`;
  let ok = true;
  const step = (label, pass, extra = '') => { ok = ok && pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); };

  let store; let staff; const hashes = [];
  try {
    store = await Store.create({
      name: tag, vatNumber: 'GB000000000',
      address: { line1: '1 Verify Street', city: 'London', postcode: 'E1 1AA' }, isActive: true,
    });
    staff = await Staff.create({
      store: store._id, employeeId: tag, displayName: 'Verify Bot', firstName: 'Verify', lastName: 'Bot',
      email: `${tag}@local.test`, pin: await bcrypt.hash('1111', 10), password: await bcrypt.hash('verify-pass-123', 10),
      role: 'owner', status: 'active',
    });

    // 1) Real login → a real refresh token (R0).
    const r0 = await authService.login(store._id.toString(), `${tag}@local.test`, 'verify-pass-123');
    step('login issues a refresh token', !!(r0 && r0.refreshToken), redact(r0 && r0.refreshToken));

    // 2) A valid refresh token refreshes (positive control). This rotates → R0 is now blacklisted, R1 is fresh.
    const r1 = await authService.refreshTokens(r0.refreshToken);
    step('a valid refresh token is accepted (rotates to a new pair)', !!(r1 && r1.refreshToken));
    hashes.push(sha256(r0.refreshToken));

    // 3) LOG OUT the fresh token (R1) …
    await authService.logout(r1.refreshToken);
    hashes.push(sha256(r1.refreshToken));
    const row = await RevokedToken.findOne({ tokenHash: sha256(r1.refreshToken) }).lean();
    step('logout records a RevokedToken row (hash only, future expiry)', !!row && row.expiresAt instanceof Date && row.expiresAt > new Date(),
      row ? `expiresAt=${row.expiresAt.toISOString()}` : 'no row');
    step('stored value is a hash, not the raw token', !!row && !JSON.stringify(row).includes(r1.refreshToken));

    // 4) … and the logged-out token is now REJECTED.
    let rejected = false;
    try { await authService.refreshTokens(r1.refreshToken); } catch { rejected = true; }
    step('the logged-out refresh token is rejected', rejected);
  } finally {
    // Clean up everything this script created.
    if (hashes.length) { try { await RevokedToken.deleteMany({ tokenHash: { $in: hashes } }); } catch { /* ignore */ } }
    if (staff) { try { await Staff.deleteOne({ _id: staff._id }); } catch { /* ignore */ } }
    if (store) { try { await Store.deleteOne({ _id: store._id }); } catch { /* ignore */ } }
    await mongoose.disconnect();
  }

  console.log(ok ? '\nRESULT: PASS — logout revokes the refresh token durably (no Redis needed).' : '\nRESULT: FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('verify-refresh-revocation error:', e.message); process.exit(1); });
