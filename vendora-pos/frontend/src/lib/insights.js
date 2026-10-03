// Owner insights — the "how's the shop really doing?" numbers, derived from the local
// stores. Pure functions, no backend.
//
// Honesty rules (see Work-Log 2026-09-30):
//  - Valuations only count products whose cost is KNOWN. Unknown-cost items are reported
//    separately (coverage) instead of being silently valued at £0 (which faked 100% margins).
//  - Sales projections say whether they're from confirmed sales or an estimate, so the
//    owner knows how much to trust them.

import { margin, isSlowStock, costKnown } from './inventoryStore';
import { velocity, topMovers, salesCoverage, salesUnits } from './movementStore';

const qtyOf = (p) => Number(p.qty) || 0;

/**
 * Per-category performance (now that products carry a category). For each category: product count, capital
 * on the shelf (qty × known cost), confirmed units sold in the window, and sales value (units × price).
 * Sorted by sales value, highest first. "Uncategorised" is included so nothing is hidden.
 */
export function categoryBreakdown(products, records, windowDays = 28, now = Date.now()) {
  const map = new Map();
  for (const p of products) {
    const cat = p.category || 'Uncategorised';
    if (!map.has(cat)) map.set(cat, { category: cat, products: 0, stockValue: 0, unitsSold: 0, salesValue: 0 });
    const row = map.get(cat);
    row.products += 1;
    if (costKnown(p) && qtyOf(p) > 0) row.stockValue += qtyOf(p) * Number(p.cost);
    const sold = salesUnits(records, p.id, windowDays, now);
    row.unitsSold += sold;
    const price = Number(p.price);
    if (Number.isFinite(price) && price > 0) row.salesValue += sold * price;
  }
  return [...map.values()].sort((a, b) => b.salesValue - a.salesValue || b.stockValue - a.stockValue);
}

/** Capital sitting on the shelves (qty × cost), counting only known-cost stock. */
export function stockValue(products) {
  let value = 0; let unknownCount = 0; let knownCount = 0;
  for (const p of products) {
    if (qtyOf(p) <= 0) continue;
    if (costKnown(p)) { value += qtyOf(p) * Number(p.cost); knownCount += 1; }
    else unknownCount += 1;
  }
  return { value, knownCount, unknownCount };
}

/** Cost value of slow stock (30d+), known-cost only. */
export function slowStockValue(products, days = 30) {
  let value = 0; let unknownCount = 0; let count = 0;
  for (const p of products) {
    if (!isSlowStock(p, days)) continue;
    count += 1;
    if (costKnown(p)) value += qtyOf(p) * Number(p.cost);
    else unknownCount += 1;
  }
  return { value, count, unknownCount };
}

/**
 * Expected retail sales per week if current velocity holds.
 * @returns { value, basis, counted } — basis 'sales' | 'estimated' | null.
 *   If ANY product has confirmed sales, basis is 'sales'; else 'estimated' from stock
 *   movement; else null (no evidence at all).
 */
export function projectedWeeklySales(products, records) {
  let confirmedValue = 0; let estimatedValue = 0; let counted = 0;
  for (const p of products) {
    const { vpd, basis } = velocity(records, p.id);
    if (!vpd) continue;
    const price = Number(p.price) || 0;
    if (price <= 0) continue;
    const wk = vpd * 7 * price;
    counted += 1;
    if (basis === 'sales') confirmedValue += wk;
    else if (basis === 'estimated') estimatedValue += wk;
  }
  if (counted === 0) return { value: null, basis: null, counted: 0, confirmedValue: 0, estimatedValue: 0 };
  // Don't label the whole forecast "from sales" when most of it is estimated (audit W13): report both
  // subtotals and a 'mixed' basis when confirmed and estimated are both present.
  const basis = confirmedValue > 0 && estimatedValue > 0 ? 'mixed' : (confirmedValue > 0 ? 'sales' : 'estimated');
  return { value: confirmedValue + estimatedValue, basis, counted, confirmedValue, estimatedValue };
}

/**
 * Average gross margin across priced products with a KNOWN cost, weighted by shelf value.
 * @returns { value, pricedCount, knownCount } — value is 0–1 or null if none computable.
 */
export function avgMargin(products) {
  let weighted = 0; let weight = 0; let pricedCount = 0; let knownCount = 0;
  for (const p of products) {
    const price = Number(p.price) || 0;
    if (price > 0) pricedCount += 1;
    const m = margin(p);
    if (m == null) continue;
    knownCount += 1;
    const w = qtyOf(p) * price || 1;
    weighted += m * w;
    weight += w;
  }
  return { value: weight > 0 ? weighted / weight : null, pricedCount, knownCount };
}

/** Best sellers over the window (confirmed sales only), joined to names: [{ id, name, units }]. */
export function bestSellers(products, records, windowDays = 28, limit = 5) {
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  return topMovers(records, windowDays, Date.now(), limit)
    .map(({ productId, units }) => ({ id: productId, name: byId[productId]?.name || 'Unknown item', units }))
    .filter((x) => x.units > 0);
}

/** How many products have confirmed sales evidence in the window (for "coverage" copy). */
export function salesEvidenceCount(records, windowDays = 28) {
  return salesCoverage(records, windowDays);
}
