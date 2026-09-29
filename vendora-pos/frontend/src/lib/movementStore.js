// Local-first movement log — the shop's real sell-through history.
//
// Every time stock goes DOWN (a sale / movement) we append one record here:
//   { productId, units, at }
// From this we derive velocity (units/day), days-of-cover, and top movers —
// the data the "smarter brain" needs. No backend; persists to localStorage and
// works offline. When the backend lands, StockMovement rows map straight onto this.
//
// Honesty note: with no till, a "sale" = any manual qty decrease. That's the best
// signal we have and it's genuinely useful; velocity is shown as "~approx" in the UI.
import { useCallback, useEffect, useState } from 'react';

const KEY = 'vendora_movements_v1';
const MAX_RECORDS = 5000;        // hard cap so storage can't grow unbounded
const MAX_AGE_DAYS = 180;        // we only ever reason over ~6 months

const DAY = 86400000;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(records) {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    /* ignore — private mode / quota */
  }
}

/** Drop records older than MAX_AGE_DAYS and trim to MAX_RECORDS (newest kept). */
function prune(records, now = Date.now()) {
  const cutoff = now - MAX_AGE_DAYS * DAY;
  let out = records.filter((r) => r && typeof r.at === 'number' && r.at >= cutoff);
  if (out.length > MAX_RECORDS) out = out.slice(out.length - MAX_RECORDS);
  return out;
}

/** Append a sale/movement. Called synchronously from the inventory store. */
export function recordSale(productId, units, at = Date.now()) {
  const u = Number(units) || 0;
  if (!productId || u <= 0) return;
  const next = prune([...load(), { productId, units: u, at }], at);
  persist(next);
  // Let other open instances / hooks refresh.
  try { window.dispatchEvent(new CustomEvent('vendora:movements')); } catch { /* ignore */ }
}

/** All records for one product within `windowDays`, newest first. */
export function recordsFor(records, productId, windowDays = 28, now = Date.now()) {
  const since = now - windowDays * DAY;
  return records.filter((r) => r.productId === productId && r.at >= since).sort((a, b) => b.at - a.at);
}

/** Units sold for a product within the window. */
export function soldInWindow(records, productId, windowDays = 28, now = Date.now()) {
  return recordsFor(records, productId, windowDays, now).reduce((n, r) => n + (Number(r.units) || 0), 0);
}

/**
 * Sell-through rate in units/day for a product, or null if we have no history.
 * Uses an *effective* window: from the first record we actually have (never less
 * than 7 days, never more than windowDays) so a product tracked for 3 days isn't
 * wildly over-projected, and a long-tracked one isn't diluted.
 */
export function velocityPerDay(records, productId, windowDays = 28, now = Date.now()) {
  const recs = recordsFor(records, productId, windowDays, now);
  if (!recs.length) return null;
  const units = recs.reduce((n, r) => n + (Number(r.units) || 0), 0);
  const firstAt = recs[recs.length - 1].at; // oldest in window
  const spanDays = Math.max(1, (now - firstAt) / DAY);
  const effectiveDays = Math.min(windowDays, Math.max(7, spanDays));
  return units / effectiveDays;
}

/** Days of stock left at current velocity. Infinity if nothing's selling. */
export function daysOfCover(qty, vpd) {
  const q = Number(qty) || 0;
  if (!vpd || vpd <= 0) return Infinity;
  return q / vpd;
}

/** Top movers by units sold in the window: [{ productId, units }], desc. */
export function topMovers(records, windowDays = 28, now = Date.now(), limit = 5) {
  const since = now - windowDays * DAY;
  const totals = new Map();
  for (const r of records) {
    if (r.at < since) continue;
    totals.set(r.productId, (totals.get(r.productId) || 0) + (Number(r.units) || 0));
  }
  return [...totals.entries()]
    .map(([productId, units]) => ({ productId, units }))
    .sort((a, b) => b.units - a.units)
    .slice(0, limit);
}

/** True once we have enough history for velocity to be meaningful. */
export function hasEnoughHistory(records, minRecords = 3) {
  return records.length >= minRecords;
}

/** React hook: live movement records. Re-renders when a sale is recorded. */
export function useMovements() {
  const [records, setRecords] = useState(load);

  useEffect(() => {
    const refresh = () => setRecords(load());
    const onStorage = (e) => { if (e.key === KEY) refresh(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('vendora:movements', refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('vendora:movements', refresh);
    };
  }, []);

  return { records };
}
