'use strict';

// Cross-device sync blob (infra Stage 3). One document per (account, store name). The `value` is the
// OPAQUE JSON string the PWA already keeps on-device for that store — the server never parses or
// interprets it, it only versions it. `rev` is a server-assigned revision that bumps on every accepted
// write (optimistic concurrency); `mtime` is the client's last-modified timestamp, used to resolve a
// concurrent-edit conflict as last-write-wins. Scoped to the PWA account (ADR-002) — nothing here
// touches the till's data models.
const mongoose = require('mongoose');

const syncBlobSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PwaAccount', required: true, index: true },
    name: { type: String, required: true },
    value: { type: String, default: '' },
    rev: { type: Number, default: 0 },
    mtime: { type: Number, default: 0 },
  },
  { timestamps: true },
);

syncBlobSchema.index({ account: 1, name: 1 }, { unique: true });

module.exports = mongoose.models.SyncBlob || mongoose.model('SyncBlob', syncBlobSchema);
