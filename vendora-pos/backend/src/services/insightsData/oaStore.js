'use strict';

// Two-layer cache for per-OA census counts, keyed by (dataset, OA):
//   L1 — an in-memory Map (this process). Instant, and the layer IN FRONT of Mongo.
//   L2 — MongoDB (InsightsOaData), durable with NO expiry (Census 2021 is static), so it survives restarts and
//        deploys and is shared across every postcode/radius that includes the same OA.
// The Nomis network fetch is only ever done for OAs missing from BOTH layers; results are written through to both.
// Everything is best-effort: if Mongo is down we degrade to L1-only (and the caller still fetches from Nomis).
const mongoose = require('mongoose');
const logger = require('../../utils/logger');

let _Model = null;
function model() { _Model = _Model || require('../../models/InsightsOaData'); return _Model; }
function dbReady() { try { return mongoose.connection.readyState === 1; } catch { return false; } }

const _mem = new Map(); // `${dataset}|${oa}` -> counts object
const memKey = (dataset, oa) => `${dataset}|${oa}`;

/**
 * Look up counts for a set of OAs in one dataset. Returns a Map(oa -> counts) for the OAs we ALREADY know
 * (from L1 or L2); OAs absent from the Map are the ones the caller must fetch from Nomis. `stats` (optional) is
 * filled with { fromMem, fromMongo } for timing/diagnostics.
 */
async function get(dataset, oaCodes, stats = null) {
  const found = new Map();
  const needMongo = [];
  let fromMem = 0;
  for (const oa of oaCodes) {
    const k = memKey(dataset, oa);
    if (_mem.has(k)) { found.set(oa, _mem.get(k)); fromMem += 1; } else needMongo.push(oa);
  }
  let fromMongo = 0;
  if (needMongo.length && dbReady()) {
    try {
      const rows = await model().find({ dataset, oa: { $in: needMongo } }, { _id: 0, oa: 1, counts: 1 }).lean();
      for (const r of rows) {
        const counts = r.counts || {};
        _mem.set(memKey(dataset, r.oa), counts);
        found.set(r.oa, counts);
        fromMongo += 1;
      }
    } catch { /* treat as a miss — the caller fetches from Nomis */ }
  }
  if (stats) { stats.fromMem = fromMem; stats.fromMongo = fromMongo; }
  return found;
}

/**
 * Write freshly fetched counts through to both layers. `map` is a Map(oa -> counts) or a plain object; every
 * entry is stored, INCLUDING an empty {} (so an OA Nomis returned nothing for is not re-queried next time).
 */
async function put(dataset, map) {
  const entries = map instanceof Map ? [...map] : Object.entries(map || {});
  for (const [oa, counts] of entries) _mem.set(memKey(dataset, oa), counts || {});
  if (!dbReady() || !entries.length) return { persisted: 0, dbReady: dbReady() };
  try {
    const ops = entries.map(([oa, counts]) => ({
      updateOne: { filter: { dataset, oa }, update: { $set: { dataset, oa, counts: counts || {}, fetchedAt: new Date() } }, upsert: true },
    }));
    const res = await model().bulkWrite(ops, { ordered: false });
    const persisted = (res && (res.upsertedCount || 0) + (res.modifiedCount || 0) + (res.matchedCount || 0)) || entries.length;
    return { persisted, dbReady: true };
  } catch (e) {
    // A failed persist just means we re-fetch that OA next cold start — but surface it, because a SILENT failure
    // here is exactly what makes oaFromMongo stay 0 (the cache never fills). One WARN per failed write.
    logger.warn(`insights oaStore: Mongo write failed for ${dataset} (${entries.length} OAs): ${e.message}`);
    return { persisted: 0, dbReady: true, error: e.message };
  }
}

// Test seam: clear the in-memory layer (and optionally the Mongo-ready check) between unit tests.
function __reset() { _mem.clear(); }
function __memSize() { return _mem.size; }

module.exports = { get, put, dbReady, __reset, __memSize };
