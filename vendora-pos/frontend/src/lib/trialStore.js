// Product trials (Phase 3 of Neighbourhood Insights) — a small, measurable range experiment the OWNER runs,
// connected to the shop's real records. A trial is the shop's OWN hypothesis + plan + outcome; it is kept
// clearly separate from published census statistics. Trials reuse the existing buy list (to order the
// products) and sales/stock/waste records (to judge the outcome) — no parallel inventory.
//
// HONESTY: an outcome is only "confirmed" from real sale records / valid imports. Without enough sales data
// we say "Not enough data" and never present a census statistic (or a hunch) as proven demand.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';
import { round2 } from './money';

const NAME = 'trials_v1';
export const TRIAL_STATUSES = ['planned', 'ordered', 'received', 'closed'];

function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function persist(list) { return writeJSON(NAME, list); }
function newId(p = 'tr') {
  try { if (crypto?.randomUUID) return `${p}_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
const num = (v) => (v === '' || v == null ? 0 : Number(v) || 0);

// ---- pure outcome (unit-tested) -------------------------------------------
/**
 * Judge a trial's outcome from the shop's REAL records. Inputs:
 *   trial.qty                 — units the owner committed to the trial
 *   soldUnits                 — confirmed units sold since the trial started (from sale records/imports), or null
 *   remainingQty              — units still in stock now
 *   wasteUnits                — units binned since the trial started
 *   hasSalesData              — whether the shop has ANY confirmed sales source (else we can't judge sell-through)
 * @returns an honest summary — never asserts proven demand.
 */
export function trialOutcome(trial, { soldUnits = null, remainingQty = null, wasteUnits = 0, hasSalesData = false } = {}) {
  const committed = num(trial && trial.qty);
  const enoughData = hasSalesData && soldUnits != null;
  const sellThroughPct = enoughData && committed > 0 ? Math.round((num(soldUnits) / committed) * 100) : null;
  let verdict = 'unknown';
  if (!enoughData) verdict = 'no-data';
  else if (sellThroughPct != null && sellThroughPct >= 60) verdict = 'selling';
  else if (sellThroughPct != null && sellThroughPct <= 15) verdict = 'slow';
  else verdict = 'mixed';
  const summary = !enoughData
    ? 'Not enough data — import or record sales to see how this trial performed.'
    : `${num(soldUnits)} of ${committed} sold${sellThroughPct != null ? ` (${sellThroughPct}% sell-through)` : ''}${num(wasteUnits) > 0 ? ` · ${num(wasteUnits)} wasted` : ''}.`;
  return {
    enoughData,
    soldUnits: enoughData ? num(soldUnits) : null,
    remainingQty: remainingQty == null ? null : num(remainingQty),
    wasteUnits: num(wasteUnits),
    sellThroughPct,
    verdict, // 'no-data' | 'slow' | 'mixed' | 'selling' — a factual label, NOT "proven demand"
    summary,
  };
}

// ---- hook -----------------------------------------------------------------
export function useTrials() {
  const [trials, setTrials] = useState(load);
  useEffect(() => {
    const refresh = () => setTrials(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('vendora:workspace', refresh); };
  }, []);
  const persistAll = (next) => { const res = persist(next); if (res.ok) setTrials(next); return res; };

  const createTrial = useCallback(({ name, barcode = '', productId = null, requestId = null, hypothesis = '', qty, budget, reviewDate = '' }) => {
    if (!String(name || '').trim() || !(num(qty) > 0)) return { ok: false, error: 'A trial needs a product name and quantity.' };
    const trial = {
      id: newId(), name: name.trim(), barcode: barcode || '', productId: productId || null, requestId: requestId || null,
      hypothesis: (hypothesis || '').trim(), qty: num(qty), budget: budget == null || budget === '' ? null : round2(budget),
      reviewDate: reviewDate || '', status: 'planned', decision: null,
      startedAt: Date.now(), receivedAt: null, closedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
    };
    const res = persistAll([trial, ...load()]);
    return res.ok ? { ok: true, trial } : res;
  }, []);

  const setStatus = useCallback((id, status) => {
    persistAll(load().map((t) => (t.id === id ? { ...t, status, receivedAt: status === 'received' ? Date.now() : t.receivedAt, updatedAt: Date.now() } : t)));
  }, []);

  /** Close a trial with an explicit decision (repeat / expand / stop). */
  const decide = useCallback((id, decision) => {
    persistAll(load().map((t) => (t.id === id ? { ...t, decision, status: 'closed', closedAt: Date.now(), updatedAt: Date.now() } : t)));
  }, []);

  const removeTrial = useCallback((id) => { persistAll(load().filter((t) => t.id !== id)); }, []);

  return { trials, createTrial, setStatus, decide, removeTrial };
}
