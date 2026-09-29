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

function load() {
  const arr = readJSON(NAME, []);
  return Array.isArray(arr) ? arr : [];
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
export function recordMovement({
  productId = null, type, delta, valuation, reason, batchId,
  unit, location, actor, operationId, at = Date.now(),
}) {
  if (!VALID_TYPES.has(type)) return null;
  const d = Number(delta);
  if (!Number.isFinite(d) || d === 0) return null;
  const rec = {
    id: newId(),
    productId: productId || null,
    type,
    delta: d,
    ...(valuation != null && Number.isFinite(Number(valuation)) ? { valuation: Number(valuation) } : {}),
    ...(reason ? { reason: String(reason) } : {}),
    ...(batchId ? { batchId } : {}),
    ...(unit ? { unit: String(unit) } : {}),
    ...(location ? { location: String(location) } : {}),
    ...(actor ? { actor: String(actor) } : {}),
    ...(operationId ? { operationId: String(operationId) } : {}),
    at,
  };
  const res = persist(prune([...load(), rec], at));
  try { window.dispatchEvent(new CustomEvent(MOVEMENT_EVENT)); } catch { /* ignore */ }
  return res.ok ? rec : null;
}

/** True if any movement with this operationId already exists — the idempotency guard so a
 *  re-submitted delivery/transfer can't be applied to stock twice. */
export function hasOperation(operationId) {
  if (!operationId) return false;
  return load().some((r) => r.operationId === operationId);
}

/** Remove movements by batchId (used to reverse a waste/undo). Returns count removed. */
export function removeByBatch(batchId) {
  if (!batchId) return 0;
  const cur = load();
  const next = cur.filter((r) => r.batchId !== batchId);
  const removed = cur.length - next.length;
  if (removed) { persist(next); try { window.dispatchEvent(new CustomEvent(MOVEMENT_EVENT)); } catch { /* ignore */ } }
  return removed;
}

// --- derivations -----------------------------------------------------------
function inWindow(records, productId, windowDays, now) {
  const since = now - windowDays * DAY;
  return records.filter((r) => r.productId === productId && r.at >= since);
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
