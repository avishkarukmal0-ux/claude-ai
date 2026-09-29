// Owner insights — the "how's the shop really doing?" numbers, derived from the
// local stores (inventory + sell-through). Pure functions, no backend. These turn
// raw stock rows into the handful of figures an owner actually acts on.

import { margin, isSlowStock } from './inventoryStore';
import { velocityPerDay, topMovers } from './movementStore';

const qtyOf = (p) => Number(p.qty) || 0;

/** Capital sitting on the shelves right now (qty × cost). */
export function stockValue(products) {
  return products.reduce((n, p) => n + qtyOf(p) * (Number(p.cost) || 0), 0);
}

/** Cost value of stock that hasn't moved in `days`+ — cash that's stuck. */
export function slowStockValue(products, days = 30) {
  return products.filter((p) => isSlowStock(p, days)).reduce((n, p) => n + qtyOf(p) * (Number(p.cost) || 0), 0);
}

/**
 * Forward projection: expected retail sales per week if current velocity holds.
 * Sums (units/day × 7 × price) across products we have a rate for. Null if we
 * can't project anything yet (no history).
 */
export function projectedWeeklySales(products, records) {
  let total = 0;
  let counted = 0;
  for (const p of products) {
    const vpd = velocityPerDay(records, p.id);
    if (!vpd) continue;
    const price = Number(p.price) || 0;
    if (price <= 0) continue;
    total += vpd * 7 * price;
    counted += 1;
  }
  return counted > 0 ? total : null;
}

/**
 * Average gross margin across priced products, weighted by shelf value so a big
 * line counts more than a single niche item. Returns 0-1, or null if uncomputable.
 */
export function avgMargin(products) {
  let weighted = 0;
  let weight = 0;
  for (const p of products) {
    const m = margin(p);
    if (m == null) continue;
    const w = qtyOf(p) * (Number(p.price) || 0) || 1; // fall back to equal weight
    weighted += m * w;
    weight += w;
  }
  return weight > 0 ? weighted / weight : null;
}

/** Best sellers over the window, joined to product names: [{ id, name, units }]. */
export function bestSellers(products, records, windowDays = 28, limit = 5) {
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  return topMovers(records, windowDays, Date.now(), limit)
    .map(({ productId, units }) => ({ id: productId, name: byId[productId]?.name || 'Unknown item', units }))
    .filter((x) => x.units > 0);
}
