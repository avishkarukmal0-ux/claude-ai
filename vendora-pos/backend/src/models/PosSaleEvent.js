'use strict';

// Durable ingestion queue for provider sale events (sales-import slice 4 scaffolding). When a verified
// webhook (or a poll) brings in a completed sale, it lands here FIRST — durably, idempotently — before any
// later processing. Decoupling receipt from processing is what lets a cloud connection survive restarts,
// retry safely, and recover missed data without the PWA open.
//
// Idempotency: `dedupeKey` is the sale/line key from salesModel (provider:merchant:saleId[:lineId]). A unique
// index on (account, dedupeKey) makes re-delivery, overlapping windows and reconnect replays no-ops.
//
// SCOPE NOTE: enqueuing an event does NOT change stock. Turning a processed event into a stock movement is the
// opt-in deduction path (slice 3, client-side today) and remains gated — this collection only guarantees we
// captured the event exactly once. Scoped to the PWA account.
const mongoose = require('mongoose');

const EVENT_STATUS = ['pending', 'processed', 'failed', 'ignored'];

const posSaleEventSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PwaAccount', required: true, index: true },
    provider: { type: String, required: true },
    dedupeKey: { type: String, required: true },   // salesModel sale/line key — the idempotency anchor
    status: { type: String, enum: EVENT_STATUS, default: 'pending' },
    // The VERIFIED provider payload (already signature-checked). Opaque until an adapter's normalizeSale is
    // verified against a sandbox; we never guess its shape here. No card data is ever stored (brief).
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    occurredAt: { type: Number, default: null },    // provider's sale timestamp (epoch ms) when known
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    processedAt: { type: Number, default: null },
  },
  { timestamps: true },
);

// Exactly-once per shop per sale/line.
posSaleEventSchema.index({ account: 1, dedupeKey: 1 }, { unique: true });
// Worker scan: oldest pending first.
posSaleEventSchema.index({ account: 1, status: 1, createdAt: 1 });

module.exports = {
  EVENT_STATUS,
  PosSaleEvent: mongoose.models.PosSaleEvent || mongoose.model('PosSaleEvent', posSaleEventSchema),
};
