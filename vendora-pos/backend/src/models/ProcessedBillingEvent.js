'use strict';

// Idempotency ledger for billing webhooks. Every provider event we accept is recorded by its unique event id;
// a duplicate delivery (Stripe retries, at-least-once) finds the id already present and is a safe no-op. Rows
// expire automatically (TTL) so the collection can't grow without bound — the retry window is far shorter.
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    provider: { type: String, default: 'stripe' },
    type: { type: String, default: null },
    accountId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 60 }, // keep 60 days, then TTL-expire
  },
  { versionKey: false },
);

module.exports = mongoose.models.ProcessedBillingEvent || mongoose.model('ProcessedBillingEvent', schema);
