// Monthly outcomes — what actually happened this month, from the real records. ACTUALS only
// (credit received, discrepancies resolved, tasks completed, stock-check coverage, waste cost).
// Estimated/opportunity figures (e.g. "rescued" savings) are reported separately and never mixed
// into the actuals. Pure functions, unit-testable.

export function sameMonth(ts, now = Date.now()) {
  if (!ts) return false;
  const a = new Date(ts); const b = new Date(now);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function statusAt(entity, status) {
  const h = (entity.history || []).filter((x) => x.status === status);
  if (h.length) return h[h.length - 1].at;
  return entity.updatedAt || entity.finishedAt || null;
}

/**
 * @returns actuals + a separate `estimated` block.
 */
export function monthlyOutcomes(input = {}) {
  // Coerce every array input defensively: a `= []` default only catches `undefined`, so an explicit
  // `null` (e.g. a store that loaded a malformed value) would slip through and throw on `.filter`.
  const arr = (v) => (Array.isArray(v) ? v : []);
  const claims = arr(input.claims);
  const tasks = arr(input.tasks);
  const products = arr(input.products);
  const stocktakeHistory = arr(input.stocktakeHistory);
  const monthWasted = Number(input.monthWasted) || 0;
  const monthSaved = Number(input.monthSaved) || 0;
  const now = input.now || Date.now();

  // Supplier credit ACTUALLY received (settled this month).
  const settled = claims.filter((c) => c.status === 'settled' && sameMonth(statusAt(c, 'settled'), now));
  const creditReceived = settled.reduce((n, c) => n + (Number(c.receivedAmount) || 0), 0);

  // Discrepancies resolved = claims reaching a terminal state (settled or rejected) this month.
  const resolved = claims.filter((c) => (c.status === 'settled' || c.status === 'rejected') && sameMonth(statusAt(c, c.status), now));

  // Credit still outstanding (requested but not yet received) — shown as in-progress, not actual.
  const outstanding = claims
    .filter((c) => ['submitted', 'acknowledged', 'approved'].includes(c.status))
    .reduce((n, c) => n + (Number(c.approvedAmount != null ? c.approvedAmount : (c.requestedAmount || 0)) || 0), 0);

  // Tasks completed this month (a completed/acknowledged entry dated in-month).
  const tasksCompleted = tasks.filter((t) => (t.history || []).some((h) => (h.action === 'completed' || h.action === 'acknowledged') && sameMonth(h.at, now))).length;

  // Stock-check coverage: products physically counted this month / total products.
  const total = products.length;
  const counted = products.filter((p) => p.countedAt && sameMonth(p.countedAt, now)).length;
  const coveragePct = total > 0 ? Math.round((counted / total) * 100) : 0;
  const stockChecks = stocktakeHistory.filter((h) => sameMonth(h.finishedAt, now)).length;

  return {
    creditReceived: Math.round(creditReceived * 100) / 100,
    creditOutstanding: Math.round(outstanding * 100) / 100,
    discrepanciesResolved: resolved.length,
    tasksCompleted,
    stockChecks,
    coverageCounted: counted,
    coverageTotal: total,
    coveragePct,
    wasteCost: Math.round((Number(monthWasted) || 0) * 100) / 100,
    // Kept SEPARATE and clearly estimated — not confirmed money.
    estimated: { rescued: Math.round((Number(monthSaved) || 0) * 100) / 100 },
  };
}
