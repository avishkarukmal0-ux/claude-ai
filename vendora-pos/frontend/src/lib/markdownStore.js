// Markdown actions (Phase 4) — reduce the shelf price of short-dated stock to sell it in time, linked to the
// dated batch it came from. A markdown is a PRICE action + a label to print; it is NOT a stock movement and
// NOT a sale:
//   • Creating a markdown NEVER changes stock (the units are still on the shelf).
//   • A markdown's "sold" figure is MANUALLY REPORTED → estimated recovery, kept separate from confirmed
//     sales (those come only from explicit sale records / valid till imports — see salesImportStore).
//   • Leftover that didn't sell is binned through the EXISTING waste flow (which is the real stock movement),
//     so sales / waste / corrections never double-count.
//   • We never offer a markdown on hard-stop-expired stock (use-by / medicine) — that must be pulled, not sold.
// Workspace-scoped + synced (markdowns_v1). Decimal-safe money via lib/money.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';
import { round2, mul } from './money';
import { actorName } from './actor';

const NAME = 'markdowns_v1';
export const MARKDOWN_STATUSES = ['active', 'closed'];

function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function persist(list) { return writeJSON(NAME, list); }
function newId(p = 'md') {
  try { if (crypto?.randomUUID) return `${p}_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
const num = (v) => (v === '' || v == null ? 0 : Number(v) || 0);

// ---- pure helpers (unit-tested) -------------------------------------------
/** Validate a proposed markdown. Returns { ok } or { ok:false, error }. Hard-stop stock is refused. */
export function validateMarkdown({ qty, originalPrice, reducedPrice, mustPull }) {
  if (mustPull) return { ok: false, error: 'Past its use-by — pull it, don’t sell it.' };
  if (!(num(qty) > 0)) return { ok: false, error: 'Enter how many units.' };
  const reduced = num(reducedPrice);
  if (!(reduced > 0)) return { ok: false, error: 'Enter the reduced price.' };
  const original = num(originalPrice);
  if (original > 0 && reduced >= original) return { ok: false, error: 'The reduced price must be lower than the current price.' };
  return { ok: true };
}

/** ESTIMATED recovery from a markdown = reduced price × units REPORTED sold. Never a confirmed receipt. */
export function estimatedRecovery(m) { return mul(num(m.reducedPrice), num(m.soldReported)); }

/** Printable / shareable label text for a markdown. */
export function markdownLabelText(m) {
  const lines = ['*** REDUCED TO CLEAR ***', m.name || 'Item'];
  if (num(m.originalPrice) > 0) lines.push(`Was £${round2(m.originalPrice).toFixed(2)}  —  NOW £${round2(m.reducedPrice).toFixed(2)}`);
  else lines.push(`Now £${round2(m.reducedPrice).toFixed(2)}`);
  if (m.expiry) {
    const d = new Date(m.expiry);
    if (!Number.isNaN(d.getTime())) lines.push(`Sell by ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`);
  }
  return lines.join('\n');
}

/** Totals over a set of markdowns — estimated figures ONLY, clearly not confirmed money. */
export function markdownTotals(list = []) {
  const arr = Array.isArray(list) ? list : [];
  const active = arr.filter((m) => m.status === 'active');
  return {
    activeCount: active.length,
    unitsOnOffer: active.reduce((n, m) => n + num(m.qty), 0),
    estimatedRecovery: round2(arr.reduce((n, m) => n + estimatedRecovery(m), 0)),
    reportedBinned: arr.reduce((n, m) => n + num(m.binned), 0),
  };
}

// ---- hook -----------------------------------------------------------------
export function useMarkdowns() {
  const [markdowns, setMarkdowns] = useState(load);
  useEffect(() => {
    const refresh = () => setMarkdowns(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('vendora:workspace', refresh); };
  }, []);
  const persistAll = (next) => { const res = persist(next); if (res.ok) setMarkdowns(next); return res; };

  /** Create a markdown. Does NOT change stock. Refuses hard-stop (mustPull) stock. @returns {ok, markdown?} */
  const createMarkdown = useCallback(({ productId = null, batchId = null, name = 'Item', qty, originalPrice, reducedPrice, expiry = null, dateType = null, mustPull = false }) => {
    const check = validateMarkdown({ qty, originalPrice, reducedPrice, mustPull });
    if (!check.ok) return { ok: false, error: check.error };
    const m = {
      id: newId(), productId, batchId, name,
      qty: num(qty), originalPrice: originalPrice == null || originalPrice === '' ? null : round2(originalPrice), reducedPrice: round2(reducedPrice),
      expiry, dateType, status: 'active', soldReported: 0, binned: 0,
      by: actorName(), createdAt: Date.now(), updatedAt: Date.now(), closedAt: null,
    };
    const res = persistAll([m, ...load()]);
    return res.ok ? { ok: true, markdown: m } : res;
  }, []);

  /** Record the OUTCOME of a markdown (manually reported). soldReported is estimated recovery, never a
   *  confirmed sale; binned is the leftover the caller should also bin through the waste flow (real stock). */
  const recordOutcome = useCallback((id, { soldReported = 0, binned = 0, close = true } = {}) => {
    persistAll(load().map((m) => (m.id === id
      ? { ...m, soldReported: num(soldReported), binned: num(binned), status: close ? 'closed' : m.status, closedAt: close ? Date.now() : m.closedAt, updatedAt: Date.now() }
      : m)));
  }, []);

  const removeMarkdown = useCallback((id) => { persistAll(load().filter((m) => m.id !== id)); }, []);

  return { markdowns, createMarkdown, recordOutcome, removeMarkdown };
}
