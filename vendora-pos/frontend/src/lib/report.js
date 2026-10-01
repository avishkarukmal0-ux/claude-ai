// Weekly owner report (Phase 3). A readable summary of the week from the existing local stores. Separates
// PENDING claims from money actually RECOVERED, states the period + freshness, and makes no compliance
// guarantee. Pure — the view loads the stores and renders / downloads the result.
import { worstExpiry } from './inventoryStore';
import { claimOutstanding } from './creditNoteStore';
import { priceHistory } from './priceHistory';
import { MOVEMENT_TYPES } from './movementStore';

const DAY = 86400000;
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const tsOf = (x) => Number(x.at || x.date || x.receivedAt || x.committedAt || x.createdAt || 0);

/**
 * @param {{ deliveries?, stocktakeHistory?, movements?, claims?, invoices?, products?, periodDays?, now? }} data
 */
export function weeklyReport({
  deliveries = [], stocktakeHistory = [], movements = [], claims = [], invoices = [], products = [],
  periodDays = 7, now = Date.now(),
} = {}) {
  const since = now - periodDays * DAY;
  const inPeriod = (ts) => ts >= since && ts <= now;

  // Named + dated checking activity.
  const deliveriesReceived = deliveries
    .filter((d) => d.status === 'received' && inPeriod(Number(d.receivedAt) || 0))
    .map((d) => ({ supplierName: d.supplierName || 'Supplier', reference: d.reference || '', at: Number(d.receivedAt) || 0, by: d.receivedBy || d.actor || null, lines: (d.lines || []).length }));
  const stocktakes = (stocktakeHistory || [])
    .filter((s) => inPeriod(tsOf(s)))
    .map((s) => ({ at: tsOf(s), by: s.by || s.actor || null, lines: s.lines ? s.lines.length : (s.countedLines || null) }));

  // Expiry actions + recorded waste.
  const wasteMoves = (movements || []).filter((m) => m.type === MOVEMENT_TYPES.WASTE && inPeriod(Number(m.at) || 0));
  const wasteUnits = wasteMoves.reduce((n, m) => n + Math.max(0, -(Number(m.delta) || 0)), 0);
  const wasteCost = r2(wasteMoves.reduce((n, m) => n + (Number(m.valuation) || 0), 0));
  const pastUseBy = (products || []).filter((p) => { const e = worstExpiry(p, new Date(now)); return e && e.mustPull && (Number(p.qty) || 0) > 0; }).length;

  // Claims: pending vs recovered (kept strictly separate).
  const openClaims = (claims || []).filter((c) => ['draft', 'submitted', 'acknowledged', 'approved'].includes(c.status));
  const outstanding = r2(openClaims.reduce((n, c) => n + claimOutstanding(c), 0));
  let creditsReceived = 0;
  for (const c of claims || []) for (const cr of c.credits || []) if (inPeriod(Number(cr.at) || 0)) creditsReceived += Number(cr.amount) || 0;
  creditsReceived = r2(creditsReceived);

  // Purchase-price changes whose latest confirmed cost landed this period.
  const priceChanges = priceHistory(invoices, products)
    .filter((row) => row.prev && inPeriod(Number(row.latest.date) || 0))
    .map((row) => ({ name: row.name, from: row.prev.unitCost, to: row.latest.unitCost, changePct: row.changePct, marginPressure: row.marginPressure, invoiceRef: row.latest.invoiceRef }));

  return {
    period: { from: since, to: now, days: periodDays },
    generatedAt: now,
    checking: { deliveriesReceived, stocktakes },
    expiry: { wasteUnits, wasteCost, pastUseBy },
    claims: { openCount: openClaims.length, outstanding, creditsReceived },
    priceChanges,
  };
}

/** Render the report as plain markdown-ish text for download/sharing. */
export function reportToText(rep) {
  const d = (ts) => (ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const gbp = (v) => `£${(Number(v) || 0).toFixed(2)}`;
  const L = [];
  L.push('VENDORA — WEEKLY OWNER REPORT');
  L.push(`Period: ${d(rep.period.from)} – ${d(rep.period.to)} (${rep.period.days} days)`);
  L.push(`Generated: ${new Date(rep.generatedAt).toLocaleString('en-GB')}`);
  L.push('');
  L.push('CHECKING ACTIVITY');
  L.push(`- Deliveries received: ${rep.checking.deliveriesReceived.length}`);
  for (const x of rep.checking.deliveriesReceived) L.push(`    • ${x.supplierName}${x.reference ? ` (${x.reference})` : ''} — ${d(x.at)}${x.by ? ` by ${x.by}` : ''}`);
  L.push(`- Stock counts: ${rep.checking.stocktakes.length}`);
  L.push('');
  L.push('EXPIRY & WASTE');
  L.push(`- Waste recorded: ${rep.expiry.wasteUnits} unit(s), ${gbp(rep.expiry.wasteCost)}`);
  L.push(`- Items currently past use-by (pull now): ${rep.expiry.pastUseBy}`);
  L.push('');
  L.push('SUPPLIER CLAIMS');
  L.push(`- Open claims: ${rep.claims.openCount}`);
  L.push(`- Outstanding (pending, NOT yet received): ${gbp(rep.claims.outstanding)}`);
  L.push(`- Credits received this period (recovered): ${gbp(rep.claims.creditsReceived)}`);
  L.push('');
  L.push('PURCHASE-PRICE CHANGES');
  if (!rep.priceChanges.length) L.push('- None this period');
  for (const x of rep.priceChanges) L.push(`    • ${x.name}: ${gbp(x.from)} → ${gbp(x.to)} (${x.changePct > 0 ? '+' : ''}${x.changePct}%)${x.marginPressure ? ' ⚠ margin pressure' : ''}`);
  L.push('');
  L.push('Pending claim amounts are what you have ASKED for, not money received. This report is an');
  L.push('operational summary and is not a guarantee of regulatory compliance.');
  return L.join('\n');
}
