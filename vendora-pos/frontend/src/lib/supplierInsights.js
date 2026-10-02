// Buying-decision insights (Phase 5) — compare what suppliers ACTUALLY charged and how reliable they've
// been, from the records the shop already keeps (committed invoices, deliveries, claims). Pure + tested.
//
// HONESTY RULES (mandate):
//   • Compare EQUIVALENT unit costs — priceHistory already normalises every invoice line to a single-unit
//     cost, so case vs unit and pack differences line up.
//   • Always show the SOURCE invoice + the date a cost was recorded.
//   • Known delivery charges are included ONLY if recorded; otherwise it's called out as missing, never
//     guessed.
//   • NO unsupported "best supplier" ranking — we report the facts per supplier and flag thin/absent data.
import { priceSeries } from './priceHistory';
import { round2, sumMoney } from './money';

const arr = (v) => (Array.isArray(v) ? v : []);
const DAY = 86400000;

/** Latest per-single-unit cost each supplier charged for a product, cheapest first, with source + date. */
export function unitCostBySupplier(invoices, productId) {
  const bySupplier = new Map();
  for (const pt of priceSeries(invoices, productId)) {
    const key = (pt.supplierName || '—').trim() || '—';
    const prev = bySupplier.get(key);
    if (!prev || (pt.date || 0) >= (prev.date || 0)) {
      bySupplier.set(key, { supplierName: key, unitCost: pt.unitCost, date: pt.date, invoiceId: pt.invoiceId, invoiceRef: pt.invoiceRef });
    }
  }
  return [...bySupplier.values()].sort((a, b) => a.unitCost - b.unitCost);
}

/**
 * Cross-supplier comparison for one product. Returns the per-supplier rows, the cheapest/dearest, the saving
 * between them, and a human note explaining any data gap. deliveryCharge (optional, per unit) is added ONLY
 * when provided; otherwise `deliveryChargeKnown:false` says so.
 */
export function compareSuppliersForProduct(invoices, product, { unitDeliveryCharges = {} } = {}) {
  const rows = unitCostBySupplier(invoices, product.id).map((r) => {
    const charge = unitDeliveryCharges[r.supplierName];
    const known = charge != null && Number.isFinite(Number(charge));
    return { ...r, deliveryChargeKnown: known, effectiveUnitCost: known ? round2(r.unitCost + Number(charge)) : r.unitCost };
  }).sort((a, b) => a.effectiveUnitCost - b.effectiveUnitCost);
  const cheapest = rows[0] || null;
  const dearest = rows.length > 1 ? rows[rows.length - 1] : null;
  const saving = cheapest && dearest ? round2(dearest.effectiveUnitCost - cheapest.effectiveUnitCost) : 0;
  let note = '';
  if (rows.length === 0) note = 'No confirmed invoice cost recorded for this product yet.';
  else if (rows.length === 1) note = 'Only one supplier on record — nothing to compare against yet.';
  else if (rows.some((r) => !r.deliveryChargeKnown)) note = 'Delivery charges not recorded — comparison is on goods cost only.';
  return { productId: product.id, name: product.name, rows, cheapest, dearest, saving, note };
}

/**
 * Reliability facts for one supplier from deliveries + claims. No score/ranking — just the numbers, with a
 * `missing` list naming what there isn't enough data for.
 */
export function supplierReliability(supplierId, { deliveries = [], claims = [] } = {}) {
  const dels = arr(deliveries).filter((d) => d.supplierId === supplierId && d.status === 'received');
  const withShortage = dels.filter((d) => arr(d.lines).some((l) => l.issue === 'missing')).length;
  const cls = arr(claims).filter((c) => c.supplierId === supplierId);
  const settled = cls.filter((c) => c.status === 'settled');
  const turns = settled.map((c) => {
    const at = lastStatusAt(c, 'settled');
    return at != null && c.createdAt != null ? (at - c.createdAt) / DAY : null;
  }).filter((n) => n != null && n >= 0);
  const avgTurnaroundDays = turns.length ? Math.round((turns.reduce((a, b) => a + b, 0) / turns.length)) : null;
  const missing = [];
  if (dels.length === 0) missing.push('no received deliveries recorded');
  if (cls.length === 0) missing.push('no claims recorded');
  if (settled.length === 0) missing.push('no settled claims to time credit turnaround');
  return {
    supplierId,
    deliveries: dels.length,
    withShortage,
    shortageRate: dels.length ? Math.round((withShortage / dels.length) * 100) : null,
    claims: cls.length,
    settled: settled.length,
    avgTurnaroundDays,
    missing,
  };
}

function lastStatusAt(claim, status) {
  const h = arr(claim.history).filter((x) => x.status === status);
  return h.length ? h[h.length - 1].at : null;
}

/** Per-supplier scorecards (facts only, no overall ranking). */
export function supplierScorecards({ suppliers = [], deliveries = [], claims = [], invoices = [] } = {}) {
  return arr(suppliers).map((s) => {
    const rel = supplierReliability(s.id, { deliveries, claims });
    const spend = sumMoney(arr(invoices).filter((i) => i.status === 'committed' && i.supplierId === s.id).map((i) => i.total || 0));
    return { id: s.id, name: s.name, ...rel, committedSpend: spend };
  });
}
