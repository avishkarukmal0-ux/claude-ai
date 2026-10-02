'use strict';

// Cross-device sync service (infra Stage 3). Thin routes → this service (project convention).
//
// Model: the PWA is local-first; each store is an opaque JSON string the client already keeps. Sync is
// per-store push/pull with a server revision (`rev`) for optimistic concurrency. A shop owner using one
// or two devices almost never edits the same store on both at once, so a genuine concurrent conflict is
// resolved last-write-wins by the client's modification time (`mtime`) — simple and predictable. Every
// query is scoped to the authenticated account id, so one shop can never read or write another's data.
const AppError = require('../utils/AppError');
const config = require('../config');
const SyncBlob = require('../models/SyncBlob');
const SyncBlobHistory = require('../models/SyncBlobHistory');

// Mirror of the client STORE_NAMES (frontend/src/lib/storage.js). We only ever persist known stores, so
// a compromised or buggy client can't fill the collection with arbitrary keys. Keep in sync with the client.
const ALLOWED = new Set([
  'shop_type', 'inventory_v1', 'suppliers_v1', 'buylist_v1', 'waste_v1', 'takings_v1', 'movements_v1',
  'suggestions_v1', 'stocktake_v1', 'stocktake_history_v1', 'deliveries_v1', 'orders_v1', 'claims_v1',
  'price_alerts_v1', 'tasks_v1', 'handovers_v1', 'requests_v1', 'sales_imports_v1', 'invoices_v1',
  'credit_notes_v1', 'markdowns_v1',
]);

const MAX_VALUE_BYTES = 2 * 1024 * 1024; // 2 MB per store — generous for a single shop, bounds abuse
const MAX_CHANGES = 40;                   // more than the number of stores; one push covers everything

// Role-based store access (backend-enforced staff permissions). The `staff` role runs the shop floor —
// stock, deliveries, counts, waste, tasks, buy lists — but NOT the money records. `manager` and `owner`
// have full access. This is the real guard: a tampered or misbehaving client can't write a store its
// role isn't allowed to, and those same financial stores are withheld from a staff member's pull.
const FINANCIAL_STORES = new Set(['takings_v1', 'claims_v1', 'credit_notes_v1', 'invoices_v1']);

/** Can this role WRITE this store? Unknown/legacy role (undefined) is treated as the owner. */
function canWriteStore(role, name) {
  if (role === 'staff') return !FINANCIAL_STORES.has(name);
  return true; // owner, manager (and legacy tokens)
}
/** Can this role READ this store (what pull returns)? Mirrors write access for financial stores. */
function canReadStore(role, name) {
  if (role === 'staff') return !FINANCIAL_STORES.has(name);
  return true;
}

// ── Server-side version history (Phase 1.3) — optional, gated on config.sync.historyEnabled ─────────────
function historyOn() { return !!config.sync.historyEnabled; }

/** Snapshot a committed revision, then prune to the most recent N for that store. Best-effort: a history
 *  failure must never fail the actual sync write. */
async function recordHistory(accountId, name, value, rev, mtime, kind = 'write') {
  if (!historyOn()) return;
  try {
    await SyncBlobHistory.create({ account: accountId, name, value, rev, mtime, kind, at: new Date() });
    const keep = Math.max(1, config.sync.historyKeep || 10);
    const old = await SyncBlobHistory.find({ account: accountId, name })
      .sort({ rev: -1 }).skip(keep).select('_id').lean();
    if (old.length) await SyncBlobHistory.deleteMany({ _id: { $in: old.map((o) => o._id) } });
  } catch { /* history is a safety net, never a blocker */ }
}

/** Recent revisions (metadata only — no values) for each store the role may see. `{ enabled, history }`. */
async function listHistory(accountId, role) {
  if (!historyOn()) return { enabled: false, history: {} };
  const keep = Math.max(1, config.sync.historyKeep || 10);
  const docs = await SyncBlobHistory.find({ account: accountId }).sort({ rev: -1 }).lean();
  const history = {};
  for (const d of docs) {
    if (!canReadStore(role, d.name)) continue;
    if (!history[d.name]) history[d.name] = [];
    if (history[d.name].length >= keep) continue;
    history[d.name].push({ rev: d.rev, mtime: d.mtime, at: d.at, kind: d.kind, size: Buffer.byteLength(d.value || '', 'utf8') });
  }
  return { enabled: true, history };
}

/** The stored value of one historical revision (role must be allowed to read that store). */
async function getHistoryVersion(accountId, name, rev, role) {
  if (!historyOn()) throw new AppError('History is not enabled', 404, 'NOT_FOUND');
  if (!ALLOWED.has(name)) throw AppError.validation(`Unknown store: ${name}`);
  if (!canReadStore(role, name)) throw new AppError('Not allowed', 403, 'FORBIDDEN');
  const doc = await SyncBlobHistory.findOne({ account: accountId, name, rev: Number(rev) }).lean();
  if (!doc) throw new AppError('Revision not found', 404, 'NOT_FOUND');
  return { name, rev: doc.rev, mtime: doc.mtime, value: doc.value, at: doc.at };
}

/**
 * Restore a store to a prior revision's value (Phase 1.3 recovery). Writes it as a NEW current revision
 * with mtime=now so it wins last-write-wins and propagates to every device. Atomic on the current rev.
 * Staff cannot restore; a financial store needs owner/manager (canWriteStore). Returns { name, rev }.
 */
async function restore(accountId, name, rev, role) {
  if (!historyOn()) throw new AppError('History is not enabled', 404, 'NOT_FOUND');
  if (role === 'staff') throw new AppError('Only the owner or a manager can restore', 403, 'FORBIDDEN');
  if (!ALLOWED.has(name)) throw AppError.validation(`Unknown store: ${name}`);
  if (!canWriteStore(role, name)) throw new AppError('Not allowed', 403, 'FORBIDDEN');
  const snap = await SyncBlobHistory.findOne({ account: accountId, name, rev: Number(rev) }).lean();
  if (!snap) throw new AppError('Revision not found', 404, 'NOT_FOUND');

  const now = Date.now();
  const current = await SyncBlob.findOne({ account: accountId, name });
  let saved;
  if (!current) {
    saved = await SyncBlob.create({ account: accountId, name, value: snap.value, rev: 1, mtime: now });
  } else {
    saved = await SyncBlob.findOneAndUpdate(
      { account: accountId, name, rev: current.rev },
      { $set: { value: snap.value, mtime: now }, $inc: { rev: 1 } },
      { new: true },
    );
    if (!saved) throw new AppError('Store changed during restore — try again', 409, 'CONFLICT');
  }
  await recordHistory(accountId, name, snap.value, saved.rev, now, 'restore');
  return { name, rev: saved.rev, fromRev: Number(rev) };
}

/** All of an account's blobs the role may see, so the client can adopt anything newer it's allowed. */
async function pull(accountId, role) {
  const docs = await SyncBlob.find({ account: accountId }).lean();
  return {
    blobs: docs
      .filter((d) => canReadStore(role, d.name))
      .map((d) => ({ name: d.name, value: d.value, rev: d.rev, mtime: d.mtime })),
  };
}

/**
 * Apply a batch of client changes. Each change: { name, value, baseRev, mtime }.
 *  - No server doc yet            → create at rev 1.
 *  - server.rev === baseRev       → fast-forward: store value, rev += 1.
 *  - server.rev !== baseRev       → concurrent edit; last-write-wins by mtime. If the client is newer
 *                                   it's applied (rev += 1); otherwise it's returned as a conflict so
 *                                   the client adopts the server's copy.
 * A change targeting a store the caller's role may not write is REJECTED (not applied) and returned in
 * `rejected` so the client can stop and re-adopt the server copy, rather than wedging the whole sync.
 * Returns { applied: [{name, rev}], conflicts: [{name, value, rev, mtime}], rejected: [{name, reason}] }.
 */
async function push(accountId, changes, role) {
  if (!Array.isArray(changes)) throw AppError.validation('changes must be an array');
  if (changes.length > MAX_CHANGES) throw AppError.validation('Too many changes in one sync');

  const applied = [];
  const conflicts = [];
  const rejected = [];
  const committed = []; // { name, value, rev, mtime } — snapshotted to history after the loop (if enabled)

  for (const c of changes) {
    const name = c && c.name;
    if (!ALLOWED.has(name)) throw AppError.validation(`Unknown store: ${name}`);
    if (!canWriteStore(role, name)) { rejected.push({ name, reason: 'forbidden' }); continue; }
    const value = typeof c.value === 'string' ? c.value : '';
    if (Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES) throw AppError.validation(`${name} is too large to sync`);
    const baseRev = Number(c.baseRev) || 0;
    const mtime = Number(c.mtime) || 0;

    // Atomic compare-and-set on (account, name, rev) so two concurrent pushes can never both "win" the
    // same revision (audit: optimistic revisions were not atomic). findOneAndUpdate is a single atomic op.
    // 1) Fast-forward: the row is exactly at the revision the client based its edit on.
    // eslint-disable-next-line no-await-in-loop
    let doc = await SyncBlob.findOneAndUpdate(
      { account: accountId, name, rev: baseRev },
      { $set: { value, mtime }, $inc: { rev: 1 } },
      { new: true },
    );
    if (doc) { applied.push({ name, rev: doc.rev }); committed.push({ name, value, rev: doc.rev, mtime }); continue; }

    // 2) No row at baseRev — it either doesn't exist yet, or the server moved on (concurrent write).
    // eslint-disable-next-line no-await-in-loop
    let current = await SyncBlob.findOne({ account: accountId, name });
    if (!current) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const created = await SyncBlob.create({ account: accountId, name, value, rev: 1, mtime });
        applied.push({ name, rev: created.rev });
        committed.push({ name, value, rev: created.rev, mtime });
        continue;
      } catch (e) {
        // A concurrent create won the unique (account,name) index — reload and fall through to resolve.
        // eslint-disable-next-line no-await-in-loop
        current = await SyncBlob.findOne({ account: accountId, name });
        if (!current) throw e;
      }
    }

    // 3) Row exists at a different revision — resolve last-write-wins by client mtime, atomically.
    if (mtime > (current.mtime || 0)) {
      // eslint-disable-next-line no-await-in-loop
      const won = await SyncBlob.findOneAndUpdate(
        { account: accountId, name, rev: current.rev },
        { $set: { value, mtime }, $inc: { rev: 1 } },
        { new: true },
      );
      if (won) { applied.push({ name, rev: won.rev }); committed.push({ name, value, rev: won.rev, mtime }); continue; }
      // Lost the CAS race to another writer — reload and report the winner as a conflict.
      // eslint-disable-next-line no-await-in-loop
      current = await SyncBlob.findOne({ account: accountId, name });
    }
    conflicts.push({ name, value: current.value, rev: current.rev, mtime: current.mtime });
  }

  // Snapshot committed revisions to history (optional, best-effort — never fails the write).
  if (historyOn()) {
    for (const h of committed) {
      // eslint-disable-next-line no-await-in-loop
      await recordHistory(accountId, h.name, h.value, h.rev, h.mtime, 'write');
    }
  }

  return { applied, conflicts, rejected };
}

module.exports = {
  pull, push, listHistory, getHistoryVersion, restore,
  ALLOWED, MAX_VALUE_BYTES, canWriteStore, canReadStore, FINANCIAL_STORES,
};
