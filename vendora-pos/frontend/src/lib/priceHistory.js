// Supplier purchase-price history (Phase 3). Built from CONFIRMED (committed) invoices only, normalised to
// a per-single-unit cost so case vs unit lines compare fairly. Shows previous→current cost, the source
// invoice, and flags margin pressure where a selling price is known. Gross margin here is ESTIMATED (price
// − cost ÷ price), explicitly not actual profit (which needs real sales). Never changes retail prices.
import { lineUnitCost } from './invoiceStore';

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Chronological per-unit cost points for one product, from committed invoices only. */
export function priceSeries(invoices, productId) {
  const points = [];
  for (const inv of invoices || []) {
    if (inv.status !== 'committed') continue;
    for (const l of inv.lines || []) {
      if (l.productId && l.productId === productId) {
        const c = lineUnitCost(l);
        if (c > 0) points.push({ date: inv.date || inv.committedAt || inv.createdAt || 0, unitCost: r2(c), invoiceId: inv.id, invoiceRef: inv.reference || '', supplierName: inv.supplierName || '' });
      }
    }
  }
  return points.sort((a, b) => (a.date || 0) - (b.date || 0));
}

/** One row per product seen on a committed invoice: latest vs previous cost, change %, estimated margins,
 *  and a margin-pressure flag. Sorted: margin pressure first, then biggest cost rise. */
export function priceHistory(invoices, products) {
  const rows = [];
  for (const p of products || []) {
    const series = priceSeries(invoices, p.id);
    if (!series.length) continue;
    const latest = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2] : null;
    const changePct = prev && prev.unitCost > 0 ? Math.round(((latest.unitCost - prev.unitCost) / prev.unitCost) * 100) : null;
    const price = Number(p.price);
    const hasPrice = Number.isFinite(price) && price > 0;
    const marginNow = hasPrice ? (price - latest.unitCost) / price : null;
    const marginPrev = (prev && hasPrice) ? (price - prev.unitCost) / price : null;
    const marginPressure = marginNow != null && marginPrev != null && marginNow < marginPrev - 0.005;
    rows.push({
      productId: p.id, name: p.name, price: hasPrice ? price : null,
      latest, prev, changePct, marginNow, marginPrev, marginPressure, count: series.length,
    });
  }
  return rows.sort((a, b) => (Number(b.marginPressure) - Number(a.marginPressure)) || ((b.changePct || 0) - (a.changePct || 0)));
}
