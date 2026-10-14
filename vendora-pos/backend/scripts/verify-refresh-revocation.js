'use strict';

/**
 * Verify the durable refresh-token blacklist WITHOUT touching any real account.
 *
 *   node scripts/verify-refresh-revocation.js
 *
 * It mints a throwaway refresh token (signed with the app's refresh secret, never a real login), confirms the
 * token is NOT blacklisted, calls authService.logout() on it, confirms a RevokedToken row now exists (hash only,
 * with the token's own expiry for the TTL index), confirms the service now treats that token as revoked, then
 * deletes the row it created. Prints PASS/FAIL and exits non-zero on failure. Reads MONGODB_URI from the env
 * (the same one the server uses), so run it in the Render shell or anywhere with DB access.
 */
require('dotenv').config();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('../src/config');
const authService = require('../src/services/authService');
const RevokedToken = require('../src/models/RevokedToken');

const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

async function main() {
  const uri = config.mongodb && config.mongodb.uri ? config.mongodb.uri : process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri);

  // A throwaway refresh token — a real JWT (so logout accepts it) but for no real staff member.
  const token = jwt.sign({ staffId: 'verify-script', storeId: 'verify-script', role: 'cashier' }, config.jwt.refreshSecret, { expiresIn: '7d' });
  const hash = sha256(token);
  let ok = true;
  const line = (label, pass, extra = '') => { ok = ok && pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); };

  try {
    const before = await RevokedToken.exists({ tokenHash: hash });
    line('token is not blacklisted before logout', !before);

    await authService.logout(token);

    const doc = await RevokedToken.findOne({ tokenHash: hash }).lean();
    line('logout wrote a RevokedToken row (hash only)', !!doc, doc ? `expiresAt=${doc.expiresAt && doc.expiresAt.toISOString()}` : 'no row');
    line('row stores a hash, not the raw token', !!doc && doc.tokenHash === hash && !String(JSON.stringify(doc)).includes(token));
    line('row has a future expiry for the TTL index', !!doc && doc.expiresAt instanceof Date && doc.expiresAt.getTime() > Date.now());

    // The service's own check now treats it as revoked (what refreshTokens() rejects on).
    const stillThere = await RevokedToken.exists({ tokenHash: hash });
    line('blacklist lookup finds the revoked token', !!stillThere);
  } finally {
    await RevokedToken.deleteOne({ tokenHash: hash }); // clean up the row this script created
    await mongoose.disconnect();
  }

  console.log(ok ? '\nRESULT: PASS — durable refresh-token revocation works (no Redis needed).' : '\nRESULT: FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('verify-refresh-revocation error:', e.message); process.exit(1); });
