'use strict';

// Durable refresh-token blacklist, so sign-out works WITHOUT Redis. One document per revoked refresh token,
// holding only a SHA-256 hash of the token (never the raw token) plus the token's own expiry. A TTL index on
// `expiresAt` lets MongoDB auto-delete the row the moment the token would have expired anyway — the blacklist
// never grows without bound and needs no sweeper. Access tokens (15 min) are untouched; this is refresh only.
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true }, // sha256(refreshToken)
    expiresAt: { type: Date, required: true }, // the refresh token's own exp — TTL index removes the row then
    revokedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

// TTL index: Mongo deletes the document once `expiresAt` passes (expireAfterSeconds: 0 = at the stored time).
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.RevokedToken || mongoose.model('RevokedToken', schema);
