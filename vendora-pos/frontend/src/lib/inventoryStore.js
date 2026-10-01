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
import { recordCostChange, isMaterialCostChange } from './priceAlertStore';

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

// ---- optional locations (shelf vs back room) -------------------------------
// `qty` is always TOTAL shop stock (source of truth). `shelfQty` is how much of that is on the
// shop floor; null means the owner isn't tracking locations for this product. back = qty − shelf.
export function shelfTracked(p) { return p != null && p.shelfQty != null; }
export function shelfQtyOf(p) { return shelfTracked(p) ? Math.max(0, Number(p.shelfQty) || 0) : null; }
export function backQtyOf(p) {
  if (!shelfTracked(p)) return null;
  return Math.max(0, (Number(p.qty) || 0) - shelfQtyOf(p));
}
/** Shelf is empty but there's stock out back → a refill is possible (NOT a purchase need). */
export function needsRefill(p) {
  return shelfTracked(p) && shelfQtyOf(p) <= 0 && (Number(p.qty) || 0) > 0;
}

// ---- optional expiry batches ----------------------------------------------
// A product's `qty` stays TOTAL. `batches` is an optional breakdown by expiry date; the part of
// stock not yet date-coded is the "undated" remainder. Date-coding allocates from undated (it
// describes stock you already have — it never changes the total).
export function batchesOf(p) { return Array.isArray(p?.batches) ? p.batches : []; }
export function datedQty(p) { return batchesOf(p).reduce((n, b) => n + (Number(b.qty) || 0), 0); }
export function undatedQty(p) { return Math.max(0, (Number(p.qty) || 0) - datedQty(p)); }
export function batchExpiryInfo(batch, from = new Date()) {
  return expiryInfo({ expiry: batch.expiry, dateType: batch.dateType }, from);
}

/**
 * Earliest-expiry-first review rows across all products. Batched products contribute one row per
 * near/expired batch; unbatched products fall back to their single product-level date. Sorted
 * soonest first. Each row: { product, batchId|null, qty, expiry, dateType, info }.
 */
export function fefo(products, from = new Date()) {
  const rows = [];
  for (const p of products) {
    const batches = batchesOf(p);
    if (batches.length) {
      for (const b of batches) {
        const info = batchExpiryInfo(b, from);
        if (info && (info.status === 'expired' || info.status === 'soon')) {
          rows.push({ product: p, batchId: b.id, qty: Number(b.qty) || 0, expiry: b.expiry, dateType: b.dateType, info });
        }
      }
    } else if (p.expiry) {
      const info = expiryInfo(p, from);
      if (info && (info.status === 'expired' || info.status === 'soon')) {
        rows.push({ product: p, batchId: null, qty: Number(p.qty) || 0, expiry: p.expiry, dateType: p.dateType, info });
      }
    }
  }
  return rows.sort((a, b) => a.info.daysLeft - b.info.daysLeft);
}

/**
 * How trustworthy a product's on-hand number is, for honest labelling:
 *  - 'counted'    : physically counted (has countedAt); most trustworthy.
 *  - 'calculated' : derived from recorded movements only (no recent count).
 * Sales aren't connected in a standalone PWA, so `salesConnected` is always false for now.
 */
export function stockStatus(p) {
  return {
    basis: p && p.countedAt ? 'counted' : 'calculated',
    countedAt: p ? p.countedAt || null : null,
    salesConnected: false,
  };
}

/** Normalise a units-per-case value: a whole number ≥ 2, else null (sold only as singles). */
export function normalisePackSize(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 2 ? n : null;
}

function normaliseNew(p) {
  return {
    id: newId(),
    barcode: (p.barcode || '').trim(),
    // A product is identified by its barcode. category + packSize + caseBarcode are what turn a bare
    // code into something the shop can act on: what kind of thing it is, and whether a scan is one unit
    // or a whole case. None of this lives in the barcode itself — it's the shop's own record.
    caseBarcode: (p.caseBarcode || '').trim() || null,  // outer/case barcode; scanning it books a full case
    category: (p.category || '').trim() || null,
    packSize: normalisePackSize(p.packSize),            // units per case (null = sold only as singles)
    name: (p.name || '').trim() || 'Unnamed item',
    cost: p.cost === '' || p.cost == null ? null : Number(p.cost),
    price: p.price === '' || p.price == null ? null : Number(p.price),
    qty: Number(p.qty) || 0,
    min: Number(p.min) || 0,
    supplierId: p.supplierId || null,
    expiry: p.expiry || null,
    dateType: p.dateType || 'best-before',
    shelfQty: p.shelfQty == null ? null : Math.max(0, Number(p.shelfQty) || 0),
    countedAt: null,
    createdAt: Date.now(),
    lastSoldAt: null,
    updatedAt: Date.now(),
  };
}

/**
 * Resolve a scanned code against a product list. Returns the identified product plus whether the code
 * was the single barcode or the outer CASE barcode, and the unit multiplier (packSize for a case, else 1).
 * This is how a scan becomes "a product + how many units" — see the Scan tab and delivery receiving.
 * @returns {{ product, unit:'single'|'case', multiplier:number } | null}
 */
export function matchBarcode(products, rawCode) {
  const code = String(rawCode || '').trim();
  if (!code) return null;
  const list = Array.isArray(products) ? products : [];
  // Prefer a single-barcode match; fall back to a case-barcode match.
  const bySingle = list.find((p) => (p.barcode || '') === code);
  if (bySingle) return { product: bySingle, unit: 'single', multiplier: 1 };
  const byCase = list.find((p) => (p.caseBarcode || '') === code);
  if (byCase) return { product: byCase, unit: 'case', multiplier: normalisePackSize(byCase.packSize) || 1 };
  return null;
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

  /**
   * Date-code stock: allocate `qty` of a product's UNDATED stock into a dated batch. Total stock
   * is unchanged (this describes stock you already have). Won't allocate more than is undated.
   */
  const addBatch = useCallback((id, { qty, expiry, dateType }) => {
    const want = Math.max(0, Number(qty) || 0);
    if (want <= 0) return { ok: false, error: 'Quantity must be positive' };
    if (!expiry) return { ok: false, error: 'Pick an expiry date' };
    const prev = load();
    const p = prev.find((x) => x.id === id);
    if (!p) return { ok: false, error: 'Product not found' };
    const alloc = Math.min(want, undatedQty(p));
    if (alloc <= 0) return { ok: false, error: 'No undated stock left to date-code' };
    const batch = { id: newId(), qty: alloc, expiry, dateType: DATE_TYPES[dateType] ? dateType : 'best-before', createdAt: Date.now() };
    const next = prev.map((x) => (x.id === id ? { ...x, batches: [...batchesOf(x), batch], updatedAt: Date.now() } : x));
    persist(next);
    setProducts(next);
    return { ok: true, allocated: alloc, batchId: batch.id };
  }, []);

  /**
   * Bin a specific dated batch: reduce that batch and the product total, log a WASTE movement
   * carrying the batch id and valuation. `opGroupId` links the ledger entry for undo. Guards
   * against binning more than the batch holds.
   */
  const wasteBatch = useCallback(({ id, batchId, qty, valuation, reason, opGroupId }) => {
    const want = Math.max(0, Number(qty) || 0);
    if (want <= 0) return { ok: false, error: 'Quantity must be positive' };
    const prev = load();
    const p = prev.find((x) => x.id === id);
    if (!p) return { ok: false, error: 'Product not found' };
    const b = batchesOf(p).find((x) => x.id === batchId);
    if (!b) return { ok: false, error: 'Batch not found' };
    const applied = Math.min(want, Number(b.qty) || 0);
    if (applied <= 0) return { ok: false, error: 'Batch is empty' };
    const newBatches = batchesOf(p)
      .map((x) => (x.id === batchId ? { ...x, qty: (Number(x.qty) || 0) - applied } : x))
      .filter((x) => (Number(x.qty) || 0) > 0);
    const next = prev.map((x) => (x.id === id ? { ...x, qty: Math.max(0, (Number(x.qty) || 0) - applied), batches: newBatches, updatedAt: Date.now() } : x));
    persist(next);
    setProducts(next);
    recordMovement({
      productId: id, type: MOVEMENT_TYPES.WASTE, delta: -applied,
      valuation: valuation != null ? Number(valuation) : (Number(p.cost) || 0) * applied,
      reason: reason || 'expired batch', batchId: opGroupId, productBatchId: batchId,
    });
    return { ok: true, applied, batch: { expiry: b.expiry, dateType: b.dateType } };
  }, []);

  /** Undo a batch waste: restore the total and top up (or recreate) the batch; drop its movement. */
  const reverseBatchWaste = useCallback(({ id, qty, opGroupId, batch }) => {
    const restore = Math.max(0, Number(qty) || 0);
    const prev = load();
    const p = prev.find((x) => x.id === id);
    if (!p) return { ok: false, error: 'Product not found' };
    let toppedUp = false;
    const newBatches = batchesOf(p).map((x) => {
      if (!toppedUp && batch && x.expiry === batch.expiry && x.dateType === batch.dateType) {
        toppedUp = true; return { ...x, qty: (Number(x.qty) || 0) + restore };
      }
      return x;
    });
    if (!toppedUp && batch) newBatches.unshift({ id: newId(), qty: restore, expiry: batch.expiry, dateType: batch.dateType, createdAt: Date.now() });
    const next = prev.map((x) => (x.id === id ? { ...x, qty: (Number(x.qty) || 0) + restore, batches: batch ? newBatches : batchesOf(x), updatedAt: Date.now() } : x));
    persist(next);
    setProducts(next);
    if (opGroupId) removeByBatch(opGroupId);
    return { ok: true };
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

  // Richer resolve used by the Scan tab: returns { product, unit:'single'|'case', multiplier } or null,
  // so a scan of the outer case barcode is understood as a full case.
  const matchByBarcode = useCallback((barcode) => matchBarcode(load(), barcode), []);

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
    const costChanges = [];
    let applied = 0;

    for (const line of (delivery.lines || [])) {
      const units = lineAcceptedUnits(line);
      if (units <= 0) continue;
      const cost = linePerUnitCost(line) || null;
      let idx = -1;
      if (line.productId) idx = next.findIndex((p) => p.id === line.productId);
      if (idx < 0 && line.barcode) idx = next.findIndex((p) => p.barcode && p.barcode === String(line.barcode).trim());

      if (idx >= 0) {
        const prevCost = next[idx].cost;
        const material = cost != null && isMaterialCostChange(prevCost, cost);
        next[idx] = {
          ...next[idx],
          qty: (Number(next[idx].qty) || 0) + units,
          // Update purchase cost only when we have a real one; NEVER touch retail price.
          cost: cost != null ? cost : next[idx].cost,
          // Preserve purchase-cost history for price alerts + audit.
          ...(material ? { costHistory: [...(next[idx].costHistory || []), { cost, at: Date.now() }] } : {}),
          updatedAt: Date.now(),
        };
        if (material) costChanges.push({ productId: next[idx].id, name: next[idx].name, prevCost, newCost: cost, price: next[idx].price });
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
    // Queue price-change alerts (retail is never auto-changed — owner approves in the queue).
    for (const c of costChanges) recordCostChange(c);
    return { ok: true, applied };
  }, []);

  /**
   * Apply a physical count SNAPSHOT-SAFELY. Each item carries the qty that was on the system
   * when it was counted (`expectedAt`); we apply the count's *correction* (counted − expectedAt)
   * to the CURRENT qty, so a sale/delivery that happened during the count is preserved instead
   * of being overwritten by a stale total. Marks countedAt (for "confirmed" status) on every
   * counted line. Logs a stock_adjustment (never a sale) for real changes.
   * @param items [{ id, counted, expectedAt?, reason? }]
   * @returns { applied, changes:[{id,delta,reason}] }
   */
  const applyCounts = useCallback((items) => {
    const prev = load();
    const byId = new Map(items.map((it) => [it.id, it]));
    const changes = [];
    const now = Date.now();
    const next = prev.map((p) => {
      const it = byId.get(p.id);
      if (!it) return p;
      const counted = Math.max(0, Number(it.counted) || 0);
      const current = Number(p.qty) || 0;
      const expectedAt = it.expectedAt == null ? current : Number(it.expectedAt) || 0;
      const delta = counted - expectedAt;                 // correction implied by the count
      const newQty = Math.max(0, current + delta);        // applied to CURRENT, not blind overwrite
      if (delta !== 0) changes.push({ id: p.id, delta, reason: it.reason || '' });
      return { ...p, qty: newQty, countedAt: now, updatedAt: now };
    });
    persist(next);
    setProducts(next);
    for (const c of changes) {
      recordMovement({
        productId: c.id, type: MOVEMENT_TYPES.STOCK_ADJUSTMENT, delta: c.delta,
        reason: c.reason ? `stocktake: ${c.reason}` : 'stocktake',
      });
    }
    return { applied: changes.length, changes };
  }, []);

  /** Start tracking a shelf/back split for a product (units currently on the shop floor). */
  const setShelfQty = useCallback((id, units) => {
    const prev = load();
    const next = prev.map((p) => {
      if (p.id !== id) return p;
      const q = Number(p.qty) || 0;
      return { ...p, shelfQty: Math.max(0, Math.min(q, Number(units) || 0)), updatedAt: Date.now() };
    });
    persist(next); setProducts(next);
  }, []);

  /**
   * Move units between back room and shop floor. TOTAL shop stock (qty) is unchanged — only the
   * shelf/back split moves. Logs a `transfer` movement (ignored by sales/velocity). Clamped so
   * shelf stays within [0, qty]. dir: 'to_shelf' (refill) | 'to_back'.
   */
  const transferStock = useCallback((id, units, dir = 'to_shelf') => {
    const move = Math.max(0, Number(units) || 0);
    if (move <= 0) return { ok: false, error: 'Quantity must be positive' };
    const prev = load();
    const p = prev.find((x) => x.id === id);
    if (!p) return { ok: false, error: 'Product not found' };
    const q = Number(p.qty) || 0;
    const shelf = shelfTracked(p) ? shelfQtyOf(p) : 0;
    const newShelf = dir === 'to_back'
      ? Math.max(0, shelf - move)
      : Math.min(q, shelf + move);
    const applied = Math.abs(newShelf - shelf);
    if (applied <= 0) return { ok: false, error: dir === 'to_back' ? 'Nothing on the shelf to move back' : 'No back-room stock to move' };
    const next = prev.map((x) => (x.id === id ? { ...x, shelfQty: newShelf, updatedAt: Date.now() } : x));
    persist(next); setProducts(next);
    recordMovement({
      productId: id, type: MOVEMENT_TYPES.TRANSFER, delta: applied,
      location: dir === 'to_back' ? 'shelf→back' : 'back→shelf',
      reason: dir === 'to_back' ? 'return to back room' : 'shelf refill',
    });
    return { ok: true, applied, shelfQty: newShelf };
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
    addBatch, wasteBatch, reverseBatchWaste,
    setCounts, applyCounts, setShelfQty, transferStock,
    findByBarcode, matchByBarcode, receiveLines, applyDelivery, importProducts, commit,
  };
}
