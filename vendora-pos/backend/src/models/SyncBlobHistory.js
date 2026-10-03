'use strict';

// Server-side version history for sync blobs (Phase 1.3 — recoverable server backups). One document per
// committed revision of a (account, name) store, written only when SYNC_HISTORY is enabled. The current
// value still lives in SyncBlob; this is the append-only trail that lets an owner restore a prior revision
// after a bad overwrite or a lost last-write-wins conflict. Capped per store (SYNC_HISTORY_KEEP) and
// expired by a TTL index (SYNC_HISTORY_TTL_DAYS) so it can't grow without bound. Account-scoped like
// everything else (ADR-002).
const mongoose = require('mongoose');
const config = require('../config');

const schema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PwaAccount', required: true, index: true },
    name: { type: String, required: true },
    value: { type: String, default: '' },
    rev: { type: Number, required: true },
    mtime: { type: Number, default: 0 },
    // How this revision came to be: a normal sync write, or an explicit restore of an older one.
    kind: { type: String, enum: ['write', 'restore'], default: 'write' },
    at: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Fast "recent revisions of this store, newest first".
schema.index({ account: 1, name: 1, rev: -1 });
// TTL backstop so history self-expires even if the per-store cap prune is missed.
schema.index({ at: 1 }, { expireAfterSeconds: Math.max(1, (config.sync.historyTtlDays || 30) * 86400) });

module.exports = mongoose.models.SyncBlobHistory || mongoose.model('SyncBlobHistory', schema);
