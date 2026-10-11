'use strict';

// Canonical monotonic revision for backup "slots" (audit B2, round 2).
//
// WHY: the GridFS `_id` (ObjectId) is NOT a reliable version pointer across processes. An ObjectId is
// 4-byte seconds + 5-byte per-process random + 3-byte counter, so two replacements of the same slot in the
// SAME second from DIFFERENT processes do not order by upload time — picking the "greatest _id" can keep the
// OLDER bytes. Instead each upload claims a strictly-increasing `rev` from an atomic per-slot counter: every
// writer agrees on the ordering, the highest rev is canonical, and cleanup only ever drops strictly-lower
// revs. The highest rev is never deleted until a genuinely later upload (higher rev) supersedes it, so a
// reader always resolves to a committed file and two concurrent writers can't delete each other's winner.
const mongoose = require('mongoose');

const COLLECTION = 'pwa_backup_revs';

/** Atomically allocate the next rev for a slot key (e.g. `${accountId}:${fileId}`, namespaced per bucket). */
async function nextRev(key) {
  const db = mongoose.connection && mongoose.connection.db;
  if (!db) throw new Error('DB_NOT_READY');
  const r = await db.collection(COLLECTION).findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  // mongodb driver v6 returns the doc directly; older drivers wrap it as { value }. Handle both.
  const doc = r && (typeof r.seq === 'number' ? r : r.value);
  return doc && typeof doc.seq === 'number' ? doc.seq : 1;
}

/** A file's rev (0 for legacy files uploaded before this change — always loses to a real rev >= 1). */
function revOf(file) {
  const v = file && file.metadata && file.metadata.rev;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Pick the canonical file from duplicates: highest rev, tie-broken by greatest _id (stable, legacy-safe). */
function pickLatest(files) {
  if (!files || !files.length) return null;
  return files.reduce((a, b) => {
    const ra = revOf(a);
    const rb = revOf(b);
    if (rb > ra) return b;
    if (rb < ra) return a;
    return String(b._id) > String(a._id) ? b : a; // equal rev (e.g. two legacy rev-0) → deterministic tie-break
  });
}

module.exports = { nextRev, revOf, pickLatest, COLLECTION };
