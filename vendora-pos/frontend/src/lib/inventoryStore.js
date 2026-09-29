// Local-first inventory store — real, working stock data saved on the device, scoped to
// the active workspace (guest or a specific shop). No backend yet: persists to localStorage
// (via lib/storage) so it survives reloads and works offline. When the backend lands, this
// same shape syncs up.
//
// Correctness rules (see Work-Log 2026-09-30):
//  - Every stock change writes a TYPED movement with the right reason. A manual quantity
//    edit is a `stock_adjustment`, NOT a sale. Real sales go through sellUnits(); waste
//    through recordWaste(); deliveries through receiveLines().
//  - Writes are deterministic: read → compute → persist synchronously → update state →
//    log the movement. Nothing depends on a deferred React updater running.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON, getActiveWorkspace } from './storage';
import { recordMovement, removeByBatch, hasOperation, MOVEMENT_TYPES } from './movementStore';
import { acceptedUnits as lineAcceptedUnits, perUnitCost as linePerUnitCost } from './deliveryStore';

const NAME = 'inventory_v1';

function load() {
  const arr = readJSON(NAME, []);
  return Array.isArray(arr) ? arr : [];
}
function persist(products) {
  return writeJSON(NAME, products); // { ok, error? } — storage emits a visible error event on failure
}
function newId() {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* ignore */ }
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Profit margin as a share of sell price (0–1), or null if not computable.
 * IMPORTANT: an unknown/blank/invalid cost is NOT the same as a zero cost. Unknown cost
 * returns null (so the UI can show "—" / "cost missing") instead of a fake 100% margin.
 */
export function margin(p) {
  const price = Number(p.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (p.cost == null || p.cost === '') return null;       // unknown cost → unknown margin
  const cost = Number(p.cost);
  if (!Number.isFinite(cost) || cost < 0) return null;    // invalid cost → unknown margin
  return (price - cost) / price;                          // explicit 0 cost is allowed (→ 100%)
}

/** True if a product's cost is unknown (blank/null/invalid) — for honest valuation coverage. */
export function costKnown(p) {
  if (p == null || p.cost == null || p.cost === '') return false;
  const c = Number(p.cost);
  return Number.isFinite(c) && c >= 0;
}

export function isLowStock(p) {
  const qty = Number(p.qty) || 0;
  const min = Number(p.min) || 0;
  return min > 0 ? qty <= min : qty <= 3; // default low-stock threshold
}

// Date types: best-before = soft (sell if fit / mark down); use-by & medicine =
// LEGAL hard-stop (illegal / criminal to sell after date).
export const DATE_TYPES = {
  'best-before': { label: 'Best before', hard: false },
  'use-by': { label: 'Use by', hard: true },
  'medicine': { label: 'Medicine expiry', hard: true },
};

/** Expiry status for a product, or null if no date set. */
export function expiryInfo(p, from = new Date()) {
  if (!p.expiry) return null;
  const d = new Date(p.expiry); d.setHours(0, 0, 0, 0);
  const today = new Date(from); today.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((d - today) / 86400000);
  const type = DATE_TYPES[p.dateType] ? p.dateType : 'best-before';
  const hard = DATE_TYPES[type].hard;
  let status = 'ok';
  if (daysLeft < 0) status = 'expired';
  else if (daysLeft <= 7) status = 'soon';
  return { date: d, daysLeft, type, hard, status, mustPull: hard && daysLeft < 0 };
}

/** Days since the product last moved, else since it was added; null if unknown. */
export function daysSinceMovement(p, from = Date.now()) {
  const ref = p.lastSoldAt || p.createdAt;
  if (!ref) return null;
  return Math.floor((from - ref) / 86400000);
}

/** Slow / dead stock: in stock but no movement for `days`+. */
export function isSlowStock(p, days = 30) {
  if ((Number(p.qty) || 0) <= 0) return false;
  const d = daysSinceMovement(p);
  return d != null && d >= days;
}

function normaliseNew(p) {
  return {
    id: newId(),
    barcode: (p.barcode || '').trim(),
    name: (p.name || '').trim() || 'Unnamed item',
    cost: p.cost === '' || p.cost == null ? null : Number(p.cost),
    price: p.price === '' || p.price == null ? null : Number(p.price),
    qty: Number(p.qty) || 0,
    min: Number(p.min) || 0,
    supplierId: p.supplierId || null,
    expiry: p.expiry || null,
    dateType: p.dateType || 'best-before',
    createdAt: Date.now(),
    lastSoldAt: null,
    updatedAt: Date.now(),
  };
}

/** React hook: live inventory + mutators. Components re-render on every change. */
export function useInventory() {
  const [products, setProducts] = useState(load);

  // Reload on cross-tab writes and on workspace switch (different shop = different data).
  useEffect(() => {
    const refresh = () => setProducts(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('vendora:workspace', refresh);
    };
  }, []);

  const addProduct = useCallback((p) => {
    const product = normaliseNew(p);
    const next = [product, ...load()];
    persist(next);
    setProducts(next);
    return product;
  }, []);

  /**
   * Generic edit. A quantity change is logged as a STOCK_ADJUSTMENT (a correction), never a
   * sale — use sellUnits() for real sales. Deterministic: persist first, then log.
   */
  const updateProduct = useCallback((id, patch) => {
    const prev = load();
    let delta = 0;
    const next = prev.map((p) => {
      if (p.id !== id) return p;
      if (patch.qty != null) delta = (Number(patch.qty) || 0) - (Number(p.qty) || 0);
      return { ...p, ...patch, updatedAt: Date.now() };
    });
    persist(next);
    setProducts(next);
    if (delta !== 0) {
      recordMovement({ productId: id, type: MOVEMENT_TYPES.STOCK_ADJUSTMENT, delta, reason: patch.reason || 'manual adjustment' });
    }
    return next.find((p) => p.id === id) || null;
  }, []);

  const removeProduct = useCallback((id) => {
    const next = load().filter((p) => p.id !== id);
    persist(next);
    setProducts(next);
  }, []);

  /**
   * Record a real sale of `units` for a product: reduces stock and logs a SALE movement
   * (the trustworthy basis for velocity). This is the integration point for a future
   * quick-sell / till link. Won't sell more than is in stock.
   */
  const sellUnits = useCallback((id, units) => {
    const u = Math.max(0, Number(units) || 0);
    if (u <= 0) return { ok: false, error: 'Quantity must be positive' };
    const prev = load();
    const p = prev.find((x) => x.id === id);
    if (!p) return { ok: false, error: 'Product not found' };
    const sold = Math.min(u, Number(p.qty) || 0);
    if (sold <= 0) return { ok: false, error: 'Nothing in stock to sell' };
    const next = prev.map((x) => (x.id === id ? { ...x, qty: (Number(x.qty) || 0) - sold, lastSoldAt: Date.now(), updatedAt: Date.now() } : x));
    persist(next);
    setProducts(next);
    recordMovement({ productId: id, type: MOVEMENT_TYPES.SALE, delta: -sold, valuation: (Number(p.price) || 0) * sold });
    return { ok: true, sold };
  }, []);

  /**
   * Bin stock: reduce quantity and log a WASTE movement (never counted as a sale).
   * Guards against over-binning. `batchId` links it to a waste-ledger entry so undo can
   * reverse both together. Returns { ok, applied }.
   */
  const recordWaste = useCallback(({ id, qty, valuation, reason, batchId }) => {
    const want = Math.max(0, Number(qty) || 0);
    if (want <= 0) return { ok: false, error: 'Quantity must be positive' };
    const prev = load();
    const p = prev.find((x) => x.id === id);
    if (!p) return { ok: false, error: 'Product not found' };
    const applied = Math.min(want, Number(p.qty) || 0);
    if (applied <= 0) return { ok: false, error: 'No stock left to bin' };
    const next = prev.map((x) => (x.id === id ? { ...x, qty: (Number(x.qty) || 0) - applied, updatedAt: Date.now() } : x));
    persist(next);
    setProducts(next);
    recordMovement({
      productId: id,
      type: MOVEMENT_TYPES.WASTE,
      delta: -applied,
      valuation: valuation != null ? Number(valuation) : (Number(p.cost) || 0) * applied,
      reason: reason || 'binned',
      batchId,
    });
    return { ok: true, applied };
  }, []);

  /** Reverse a waste event (undo): restore stock and drop its movement(s). */
  const reverseWaste = useCallback(({ id, qty, batchId }) => {
    const restore = Math.max(0, Number(qty) || 0);
    const prev = load();
    const next = prev.map((x) => (x.id === id ? { ...x, qty: (Number(x.qty) || 0) + restore, updatedAt: Date.now() } : x));
    persist(next);
    setProducts(next);
    if (batchId) removeByBatch(batchId);
    return { ok: true };
  }, []);

  /** Bulk import (from CSV). Skips rows whose barcode already exists. Deterministic persist. */
  const importProducts = useCallback((rows) => {
    const prev = load();
    const seen = new Set(prev.filter((p) => p.barcode).map((p) => p.barcode));
    let added = 0; let skipped = 0;
    const created = [];
    for (const r of rows) {
      const barcode = (r.barcode || '').trim();
      if (barcode && seen.has(barcode)) { skipped++; continue; }
      if (barcode) seen.add(barcode);
      created.push(normaliseNew({ ...r, min: 0 }));
      added++;
    }
    const next = [...created, ...prev];
    persist(next);
    setProducts(next);
    return { added, skipped };
  }, []);

  const findByBarcode = useCallback((barcode) => {
    const b = (barcode || '').trim();
    if (!b) return null;
    return load().find((p) => p.barcode && p.barcode === b) || null;
  }, []);

  /** Apply a goods-in delivery: lines = [{ barcode, name, cost, qty }]. Logs GOODS_RECEIVED. */
  const receiveLines = useCallback((lines) => {
    const prev = load();
    const next = [...prev];
    const received = [];
    for (const line of lines) {
      const addQty = Number(line.qty) || 0;
      if (addQty <= 0) continue;
      const idx = line.barcode ? next.findIndex((p) => p.barcode && p.barcode === line.barcode.trim()) : -1;
      if (idx >= 0) {
        next[idx] = {
          ...next[idx],
          qty: (Number(next[idx].qty) || 0) + addQty,
          cost: line.cost === '' || line.cost == null ? next[idx].cost : Number(line.cost),
          updatedAt: Date.now(),
        };
        received.push({ id: next[idx].id, delta: addQty });
      } else {
        const created = normaliseNew({ barcode: line.barcode, name: line.name || 'New item', cost: line.cost, price: null, qty: addQty });
        next.unshift(created);
        received.push({ id: created.id, delta: addQty });
      }
    }
    persist(next);
    setProducts(next);
    for (const r of received) {
      recordMovement({ productId: r.id, type: MOVEMENT_TYPES.GOODS_RECEIVED, delta: r.delta, reason: 'goods-in' });
    }
  }, []);

  /**
   * Apply a received delivery to stock. Idempotent by delivery id (operationId): a
   * re-submitted delivery can't double-count. For each line it adds the ACCEPTED units
   * (delivered minus missing/damaged), updates the PURCHASE cost (never the retail price),
   * and logs a goods_received movement carrying the operationId. Unknown barcodes are created.
   * @returns { ok, applied, duplicate?, error? }
   */
  const applyDelivery = useCallback((delivery) => {
    if (!delivery || !delivery.id) return { ok: false, error: 'Invalid delivery' };
    if (hasOperation(delivery.id)) return { ok: false, duplicate: true, error: 'This delivery was already received' };

    const prev = load();
    const next = [...prev];
    const toLog = [];
    let applied = 0;

    for (const line of (delivery.lines || [])) {
      const units = lineAcceptedUnits(line);
      if (units <= 0) continue;
      const cost = linePerUnitCost(line) || null;
      let idx = -1;
      if (line.productId) idx = next.findIndex((p) => p.id === line.productId);
      if (idx < 0 && line.barcode) idx = next.findIndex((p) => p.barcode && p.barcode === String(line.barcode).trim());

      if (idx >= 0) {
        next[idx] = {
          ...next[idx],
          qty: (Number(next[idx].qty) || 0) + units,
          // Update purchase cost only when we have a real one; NEVER touch retail price.
          cost: cost != null ? cost : next[idx].cost,
          updatedAt: Date.now(),
        };
        toLog.push({ id: next[idx].id, units, cost });
      } else {
        const created = normaliseNew({ barcode: line.barcode, name: line.name || 'New item', cost, price: null, qty: units });
        next.unshift(created);
        toLog.push({ id: created.id, units, cost });
      }
      applied += units;
    }

    persist(next);
    setProducts(next);
    for (const r of toLog) {
      recordMovement({
        productId: r.id,
        type: MOVEMENT_TYPES.GOODS_RECEIVED,
        delta: r.units,
        valuation: r.cost != null ? r.cost * r.units : undefined,
        unit: 'unit',
        reason: `Delivery ${delivery.reference || ''}`.trim(),
        operationId: delivery.id,
      });
    }
    return { ok: true, applied };
  }, []);

  /**
   * Apply stocktake counts: set exact qty for each id. A count is a CORRECTION, logged as a
   * STOCK_ADJUSTMENT (never a sale), so velocity stays clean after a stocktake.
   */
  const setCounts = useCallback((counts) => {
    const prev = load();
    const changes = [];
    const next = prev.map((p) => {
      if (counts[p.id] == null) return p;
      const target = Math.max(0, Number(counts[p.id]) || 0);
      const delta = target - (Number(p.qty) || 0);
      if (delta !== 0) changes.push({ id: p.id, delta });
      return { ...p, qty: target, updatedAt: Date.now() };
    });
    persist(next);
    setProducts(next);
    for (const c of changes) {
      recordMovement({ productId: c.id, type: MOVEMENT_TYPES.STOCK_ADJUSTMENT, delta: c.delta, reason: 'stocktake' });
    }
  }, []);

  const commit = useCallback((nextProducts) => {
    persist(nextProducts);
    setProducts(nextProducts);
  }, []);

  return {
    products,
    workspace: getActiveWorkspace(),
    addProduct, updateProduct, removeProduct,
    sellUnits, recordWaste, reverseWaste,
    setCounts, findByBarcode, receiveLines, applyDelivery, importProducts, commit,
  };
}
