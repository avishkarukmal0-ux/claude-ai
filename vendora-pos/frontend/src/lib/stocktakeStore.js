// Local-first stocktake — count the shop, catch shrinkage. No backend.
//
// An active count session lives in one localStorage key; finished counts are
// summarised into a history key so the owner can see shrinkage over time.
// Applying counts to stock is done by the caller via inventory.setCounts(); this
// store only holds the session and computes the maths.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON, removeKey } from './storage';
import { actorName } from './actor';

const S_KEY = 'stocktake_v1';          // active session (logical name)
const H_KEY = 'stocktake_history_v1';  // past summaries (logical name)

function loadJSON(name, fallback) {
  const v = readJSON(name, undefined);
  return v === undefined ? fallback : v;
}
function persist(name, value) {
  if (value == null) return removeKey(name);
  return writeJSON(name, value);
}
function newId(prefix = 's') {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* ignore */ }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build the count summary: expected (current stock) vs counted, per line, plus the
 * headline shrinkage/overage figures. Call this BEFORE applying counts to stock.
 */
export function buildSummary(session, products) {
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const counts = session?.counts || {};
  const expectedMap = session?.expected || {};
  const reasons = session?.reasons || {};
  const lines = [];
  for (const [productId, countedRaw] of Object.entries(counts)) {
    const p = byId[productId];
    if (!p) continue;
    // Expected = what the system said WHEN COUNTED (snapshot), so variance reflects the true
    // discrepancy at count time even if stock moved since. Falls back to current for old sessions.
    const expected = expectedMap[productId] == null ? (Number(p.qty) || 0) : Number(expectedMap[productId]) || 0;
    const counted = Number(countedRaw) || 0;
    const variance = counted - expected;          // negative = missing
    const cost = Number(p.cost) || 0;
    lines.push({ productId, name: p.name, barcode: p.barcode, expected, counted, variance, value: variance * cost, reason: reasons[productId] || '' });
  }
  const discrepancies = lines.filter((l) => l.variance !== 0);
  const shrinkageValue = lines.filter((l) => l.variance < 0).reduce((n, l) => n - l.value, 0); // positive £ lost
  const shrinkageUnits = lines.filter((l) => l.variance < 0).reduce((n, l) => n - l.variance, 0);
  const overageValue = lines.filter((l) => l.variance > 0).reduce((n, l) => n + l.value, 0);
  const netValue = lines.reduce((n, l) => n + l.value, 0); // negative = net loss
  return {
    itemsCounted: lines.length,
    discrepancyCount: discrepancies.length,
    shrinkageUnits,
    shrinkageValue,
    overageValue,
    netValue,
    discrepancies: discrepancies.sort((a, b) => a.value - b.value), // biggest loss first
  };
}

export function useStocktake() {
  const [session, setSession] = useState(() => loadJSON(S_KEY, null));
  const [history, setHistory] = useState(() => loadJSON(H_KEY, []));

  useEffect(() => {
    const refresh = () => { setSession(loadJSON(S_KEY, null)); setHistory(loadJSON(H_KEY, [])); };
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('vendora:workspace', refresh);
    };
  }, []);

  const start = useCallback((name) => {
    const s = { id: newId(), name: name || 'Stock count', startedAt: Date.now(), counts: {}, expected: {}, reasons: {} };
    persist(S_KEY, s); setSession(s); return s;
  }, []);

  // Snapshot the system qty the FIRST time an item is touched in this count, so later edits keep
  // the original count-time expected (concurrency-safe apply).
  function withExpected(prev, productId, expectedAt) {
    const expected = { ...(prev.expected || {}) };
    if (expected[productId] == null && expectedAt != null) expected[productId] = Math.max(0, Number(expectedAt) || 0);
    return expected;
  }

  /** Set an item's counted qty. qty '' / null clears it. Pass expectedAt (current system qty). */
  const countItem = useCallback((productId, qty, expectedAt) => {
    setSession((prev) => {
      if (!prev) return prev;
      const counts = { ...prev.counts };
      const expected = withExpected(prev, productId, expectedAt);
      if (qty === '' || qty == null) delete counts[productId];
      else counts[productId] = Math.max(0, Number(qty) || 0);
      const next = { ...prev, counts, expected };
      persist(S_KEY, next);
      return next;
    });
  }, []);

  /** Add n to an item's count (scan-to-count). Pass expectedAt (current system qty). */
  const bumpItem = useCallback((productId, n = 1, expectedAt) => {
    setSession((prev) => {
      if (!prev) return prev;
      const counts = { ...prev.counts };
      const expected = withExpected(prev, productId, expectedAt);
      counts[productId] = Math.max(0, (Number(counts[productId]) || 0) + n);
      const next = { ...prev, counts, expected };
      persist(S_KEY, next);
      return next;
    });
  }, []);

  /** Record a reason for a discrepancy on a counted item. */
  const setReason = useCallback((productId, text) => {
    setSession((prev) => {
      if (!prev) return prev;
      const reasons = { ...(prev.reasons || {}) };
      reasons[productId] = text || '';
      const next = { ...prev, reasons };
      persist(S_KEY, next);
      return next;
    });
  }, []);

  const cancel = useCallback(() => { persist(S_KEY, null); setSession(null); }, []);

  /** Persist a finished summary to history and clear the active session. */
  const saveSummary = useCallback((summary, meta = {}) => {
    const entry = {
      id: newId('h'),
      name: meta.name || 'Stock count',
      by: meta.by || actorName(),
      startedAt: meta.startedAt || Date.now(),
      finishedAt: Date.now(),
      itemsCounted: summary.itemsCounted,
      discrepancyCount: summary.discrepancyCount,
      shrinkageUnits: summary.shrinkageUnits,
      shrinkageValue: summary.shrinkageValue,
      overageValue: summary.overageValue,
      netValue: summary.netValue,
    };
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, 50);
      persist(H_KEY, next);
      return next;
    });
    persist(S_KEY, null); setSession(null);
    return entry;
  }, []);

  return { session, history, start, countItem, bumpItem, setReason, cancel, saveSummary };
}
