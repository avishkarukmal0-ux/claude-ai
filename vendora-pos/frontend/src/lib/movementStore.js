// Typed movement log — the shop's stock history, with an explicit reason for every change.
//
// Each record: { id, productId, type, delta, valuation?, reason?, batchId?, at }
//   delta  = signed change to stock (goods in > 0, sale/waste < 0)
//   type   = one of MOVEMENT_TYPES (why the stock changed)
//
// Why typed (see Work-Log 2026-09-30): the old log treated EVERY quantity decrease as a
// "sale", so waste, corrections and stocktakes inflated sales velocity. Reorder/insights
// now count only real sales evidence, and clearly label estimates when that's all we have.
//
// Framework-free core (unit-testable); a thin React hook lives at the bottom.
import { useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';
import { currentActor } from './actor';

const NAME = 'movements_v1';
const MAX_RECORDS = 5000;
const MAX_AGE_DAYS = 180;
const DAY = 86400000;

export const MOVEMENT_TYPES = Object.freeze({
  GOODS_RECEIVED: 'goods_received',
  SALE: 'sale',
  WASTE: 'waste',
  CUSTOMER_RETURN: 'customer_return',
  SUPPLIER_RETURN: 'supplier_return',
  TRANSFER: 'transfer',            // location→location; nets to zero for total shop stock
  STOCK_ADJUSTMENT: 'stock_adjustment',
});
const VALID_TYPES = new Set(Object.values(MOVEMENT_TYPES));

const MOVEMENT_EVENT = 'vendora:movements';

/**
 * Drop structurally-invalid rows (unknown type, non-finite/zero delta, bad timestamp) so one corrupt
 * record can never crash velocity/history or be carried forward on a write (Phase 1.2f: validate existing
 * data before using/migrating it). Valid rows are untouched.
 */
export function sanitizeMovements(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter((r) => (
    r && typeof r === 'object'
    && VALID_TYPES.has(r.type)
    && Number.isFinite(Number(r.delta)) && Number(r.delta) !== 0
    && typeof r.at === 'number' && Number.isFinite(r.at)
  ));
}

function load() {
  return sanitizeMovements(readJSON(NAME, []));
}
function persist(records) {
  return writeJSON(NAME, records);
}
function prune(records, now = Date.now()) {
  const cutoff = now - MAX_AGE_DAYS * DAY;
  let out = records.filter((r) => r && typeof r.at === 'number' && r.at >= cutoff);
  if (out.length > MAX_RECORDS) out = out.slice(out.length - MAX_RECORDS);
  return out;
}
function newId() {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* ignore */ }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Append a typed movement. Deterministic: reads current, writes synchronously, returns
 * the created record (or null on bad input). NOT dependent on any React update running.
 *
 * Optional fields (recorded when applicable, per the review spec):
 *  - unit        e.g. 'unit' | 'case' | 'kg'
 *  - location    e.g. 'shelf' | 'back' (for transfers / located stock)
 *  - actor       who did it (staff id/name) — null for single-user guest use
 *  - operationId groups movements from one business operation (a delivery, a transfer) and
 *                makes re-applying idempotent (see hasOperation()).
 *  - batchId     links a batch (Stage 4) / a waste undo group
 */
/**
 * Build one normalized movement record (or null on bad input). Centralizes the record shape — including
 * WHO did it: unless an explicit `actor` is passed, the signed-in member is captured ("Owner" for the
 * guest / accounts-off case), so every ledger row carries actor/actorId/actorRole and is attributable
 * (Phase 1.2b). Also carries `reversalOf` for compensating reversal entries (Phase 1.2d).
 */
function buildRecord(e) {
  if (!e || !VALID_TYPES.has(e.type)) return null;
  const d = Number(e.delta);
  if (!Number.isFinite(d) || d === 0) return null;
  const who = currentActor();
  const at = e.at || Date.now();
  return {
    id: newId(),
    productId: e.productId || null,
    type: e.type,
    delta: d,
    ...(e.valuation != null && Number.isFinite(Number(e.valuation)) ? { valuation: Number(e.valuation) } : {}),
    ...(e.reason ? { reason: String(e.reason) } : {}),
    ...(e.batchId ? { batchId: e.batchId } : {}),                      // waste-undo / op group id
    ...(e.productBatchId ? { productBatchId: String(e.productBatchId) } : {}), // the dated batch wasted
    ...(e.unit ? { unit: String(e.unit) } : {}),
    ...(e.location ? { location: String(e.location) } : {}),
    ...(e.operationId ? { operationId: String(e.operationId) } : {}),
    ...(e.reversalOf ? { reversalOf: String(e.reversalOf) } : {}),
    actor: e.actor != null ? String(e.actor) : who.name,
    ...(who.id ? { actorId: who.id } : {}),
    ...(who.role ? { actorRole: who.role } : {}),
    at,
  };
}

/**
 * Append a typed movement. Deterministic: reads current, writes synchronously, returns the created record
 * (or null on bad input). See buildRecord for the full field list (incl. actor attribution).
 */
export function recordMovement(entry) {
  const rec = buildRecord(entry);
  if (!rec) return null;
  const res = persist(prune([...load(), rec], rec.at));
  try { window.dispatchEvent(new CustomEvent(MOVEMENT_EVENT)); } catch { /* ignore */ }
  return res.ok ? rec : null;
}

/** Append several movements in ONE persist so an import is all-or-nothing (audit W10): a mid-way storage
 *  failure can't leave half the rows written (which would block retry via the operationId guard). Returns
 *  { ok, written }. */
export function recordMany(entries = []) {
  const recs = [];
  let maxAt = Date.now();
  for (const e of entries) {
    const rec = buildRecord(e);
    if (!rec) continue;
    if (rec.at > maxAt) maxAt = rec.at;
    recs.push(rec);
  }
  if (!recs.length) return { ok: true, written: 0 };
  const res = persist(prune([...load(), ...recs], maxAt));
  if (res.ok) { try { window.dispatchEvent(new CustomEvent(MOVEMENT_EVENT)); } catch { /* ignore */ } }
  return { ok: !!res.ok, written: res.ok ? recs.length : 0 };
}

/** True if any movement with this operationId already exists — the idempotency guard so a
 *  re-submitted delivery/transfer can't be applied to stock twice. */
export function hasOperation(operationId) {
  if (!operationId) return false;
  return load().some((r) => r.operationId === operationId);
}

/** Remove movements by batchId (used by sales-import undo, where re-importing the same file must be
 *  allowed afterwards). Returns count removed. For STOCK undos prefer reverseByBatch (keeps history). */
export function removeByBatch(batchId) {
  if (!batchId) return 0;
  const cur = load();
  const next = cur.filter((r) => r.batchId !== batchId);
  const removed = cur.length - next.length;
  if (removed) { persist(next); try { window.dispatchEvent(new CustomEvent(MOVEMENT_EVENT)); } catch { /* ignore */ } }
  return removed;
}

/**
 * Reverse every movement in a batch by APPENDING a compensating correction for each (delta negated),
 * tagged `reversalOf` — never deleting the original (Phase 1.2d: corrections/reversals retain history).
 * Idempotent: a batch already reversed is skipped. Returns { ok, reversed }.
 */
export function reverseByBatch(batchId, { reason } = {}) {
  if (!batchId) return { ok: true, reversed: 0 };
  const all = load();
  const already = new Set(all.filter((r) => r.reversalOf).map((r) => r.reversalOf));
  const originals = all.filter((r) => r.batchId === batchId && !r.reversalOf && !already.has(r.id));
  if (!originals.length) return { ok: true, reversed: 0 };
  const entries = originals.map((o) => ({
    productId: o.productId,
    type: MOVEMENT_TYPES.STOCK_ADJUSTMENT, // a reversal is a correction; keeps sales velocity clean
    delta: -o.delta,
    ...(o.valuation != null ? { valuation: -o.valuation } : {}),
    reason: reason || `Reversed ${String(o.type).replace(/_/g, ' ')}`,
    batchId: `rev_${batchId}`,
    reversalOf: o.id,
    ...(o.productBatchId ? { productBatchId: o.productBatchId } : {}),
  }));
  const res = recordMany(entries);
  return { ok: !!res.ok, reversed: res.ok ? entries.length : 0 };
}

// --- derivations -----------------------------------------------------------
function inWindow(records, productId, windowDays, now) {
  const since = now - windowDays * DAY;
  // Closed window [since, now]: a stray future-dated row must never inflate velocity/sales (audit W11).
  return records.filter((r) => r.productId === productId && r.at >= since && r.at <= now);
}

/** Confirmed sale units for a product in the window (never counts waste/returns/adjustments). */
export function salesUnits(records, productId, windowDays = 28, now = Date.now()) {
  return inWindow(records, productId, windowDays, now)
    .filter((r) => r.type === MOVEMENT_TYPES.SALE)
    .reduce((n, r) => n + Math.max(0, -r.delta), 0);
}

/** Unexplained depletion (manual downward adjustments) — the estimate basis when no sales exist. */
export function inferredDepletionUnits(records, productId, windowDays = 28, now = Date.now()) {
  return inWindow(records, productId, windowDays, now)
    .filter((r) => r.type === MOVEMENT_TYPES.STOCK_ADJUSTMENT && r.delta < 0)
    .reduce((n, r) => n + (-r.delta), 0);
}

/**
 * Sell-through velocity for a product.
 * @returns { vpd, basis, days } where basis is 'sales' | 'estimated' | null.
 *   - 'sales'     : from confirmed sale movements (trustworthy).
 *   - 'estimated' : inferred from manual stock decreases (labelled as an estimate in UI).
 *   - null        : not enough evidence → callers should show "insufficient data".
 */
export function velocity(records, productId, windowDays = 28, now = Date.now()) {
  const recs = inWindow(records, productId, windowDays, now);
  if (!recs.length) return { vpd: null, basis: null, days: 0 };
  const firstAt = recs.reduce((min, r) => Math.min(min, r.at), now);
  const spanDays = Math.max(1, (now - firstAt) / DAY);
  const effectiveDays = Math.min(windowDays, Math.max(7, spanDays));

  const sold = salesUnits(records, productId, windowDays, now);
  if (sold > 0) return { vpd: sold / effectiveDays, basis: 'sales', days: Math.round(effectiveDays) };

  const inferred = inferredDepletionUnits(records, productId, windowDays, now);
  if (inferred > 0) return { vpd: inferred / effectiveDays, basis: 'estimated', days: Math.round(effectiveDays) };

  return { vpd: null, basis: null, days: Math.round(effectiveDays) };
}

/** Days of stock left at a given velocity. Infinity if nothing's moving. */
export function daysOfCover(qty, vpd) {
  const q = Number(qty) || 0;
  if (!vpd || vpd <= 0) return Infinity;
  return q / vpd;
}

/** Top movers by confirmed sales in the window: [{ productId, units }]. */
export function topMovers(records, windowDays = 28, now = Date.now(), limit = 5) {
  const since = now - windowDays * DAY;
  const totals = new Map();
  for (const r of records) {
    if (r.at < since || r.type !== MOVEMENT_TYPES.SALE) continue;
    totals.set(r.productId, (totals.get(r.productId) || 0) + Math.max(0, -r.delta));
  }
  return [...totals.entries()]
    .map(([productId, units]) => ({ productId, units }))
    .sort((a, b) => b.units - a.units)
    .slice(0, limit);
}

/** Total sales-evidence coverage: how many distinct products have confirmed sales in window. */
export function salesCoverage(records, windowDays = 28, now = Date.now()) {
  const since = now - windowDays * DAY;
  const ids = new Set();
  for (const r of records) if (r.at >= since && r.type === MOVEMENT_TYPES.SALE) ids.add(r.productId);
  return ids.size;
}

/**
 * Per-product movement history with a running balance derived from the ledger — the audit trail that
 * explains how the current quantity was reached (Phase 1.2c). Oldest→newest internally so the balance is
 * correct; returned newest-first by default for display.
 */
export function movementHistory(records, productId, { newestFirst = true } = {}) {
  const rows = (records || []).filter((r) => r && r.productId === productId).slice().sort((a, b) => a.at - b.at);
  let balance = 0;
  const withBalance = rows.map((r) => { balance += r.delta; return { ...r, balance }; });
  return newestFirst ? withBalance.reverse() : withBalance;
}

/**
 * Reconcile the ledger against the stored quantity. `difference` is the quantity NOT explained by recorded
 * movements — i.e. the opening balance that existed before movement tracking (or, if negative, stock that
 * left without a movement). Surfaced honestly in the history view rather than hidden.
 */
export function reconcileQty(records, productId, currentQty) {
  const ledgerSum = (records || []).filter((r) => r && r.productId === productId).reduce((n, r) => n + r.delta, 0);
  const q = Number(currentQty) || 0;
  return { ledgerSum, currentQty: q, difference: q - ledgerSum, matches: q === ledgerSum };
}

/** React hook: live movement records. */
export function useMovements() {
  const [records, setRecords] = useState(load);
  useEffect(() => {
    const refresh = () => setRecords(load());
    window.addEventListener('vendora:movements', refresh);
    window.addEventListener('vendora:workspace', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('vendora:movements', refresh);
      window.removeEventListener('vendora:workspace', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return { records };
}
