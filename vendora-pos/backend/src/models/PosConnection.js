'use strict';

// A shop's connection to one POS/till provider (sales-import slice 4 scaffolding). One document per
// (account, provider). Scoped to the PWA account (ADR-002) — a shop only ever sees its own connections.
//
// IMPORTANT — secrets: the provider access/refresh tokens are NEVER stored in the clear. `tokenCipher` holds
// an AES-256-GCM token produced by utils/secretBox (key = POS_TOKEN_KEY, server-side only). We store only an
// encrypted blob plus NON-secret metadata (external merchant id, scopes, status). Nothing here is ever sent
// to the client except the non-secret status fields. Until a provider is accredited and credentials exist, no
// document is created at all — connecting reports "not available yet".
const mongoose = require('mongoose');

const CONNECTION_STATUS = ['not_connected', 'connected', 'needs_attention', 'paused'];

const posConnectionSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PwaAccount', required: true, index: true },
    provider: { type: String, required: true }, // registry id: 'square' | 'shopify' | 'zettle' | ...
    status: { type: String, enum: CONNECTION_STATUS, default: 'not_connected' },
    scopes: { type: [String], default: [] },          // read-only scopes actually granted
    externalMerchantId: { type: String, default: '' }, // provider's merchant/location id (NOT a secret)
    tokenCipher: { type: String, default: '' },         // secretBox token; empty until a real token is held
    tokenExpiresAt: { type: Number, default: null },    // epoch ms, for refresh scheduling
    lastSyncAt: { type: Number, default: null },
    lastError: { type: String, default: '' },           // last connect/sync failure (non-sensitive message)
  },
  { timestamps: true },
);

// One connection per provider per shop.
posConnectionSchema.index({ account: 1, provider: 1 }, { unique: true });

// Defence in depth: never serialise the encrypted token (or __v) to any API response.
posConnectionSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.tokenCipher;
    delete ret.__v;
    return ret;
  },
});

/** The non-secret view safe to return to the client. */
posConnectionSchema.methods.toClient = function toClient() {
  return {
    provider: this.provider,
    status: this.status,
    scopes: this.scopes,
    externalMerchantId: this.externalMerchantId || null,
    lastSyncAt: this.lastSyncAt || null,
    lastError: this.lastError || null,
    updatedAt: this.updatedAt,
  };
};

module.exports = {
  CONNECTION_STATUS,
  PosConnection: mongoose.models.PosConnection || mongoose.model('PosConnection', posConnectionSchema),
};
