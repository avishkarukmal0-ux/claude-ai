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
import { recordMovement, reverseByBatch, hasOperation, MOVEMENT_TYPES } from './movementStore';
import { acceptedUnits as lineAcceptedUnits, perUnitCost as linePerUnitCost } from './deliveryStore';
import { recordCostChange, isMaterialCostChange } from './priceAlertStore';
import { reassignProductRefs } from './productMerge';

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

/** Set lastSoldAt for products from imported sales — NO qty change, NO movement (audit W12): imported
 *  sales should stop a product reading as "never sold"/slow stock. map = { productId: epochMs }. */
export function markSold(map) {
  if (!map || typeof map !== 'object') return { ok: true, updated: 0 };
  const prev = load();
  let updated = 0;
  const next = prev.map((p) => {
    const ts = map[p.id];
    if (ts && ts > (Number(p.lastSoldAt) || 0)) { updated += 1; return { ...p, lastSoldAt: ts }; }
    return p;
  });
  if (!updated) return { ok: true, updated: 0 };
  const res = persist(next);
  return { ok: !!res.ok, updated };
}

// Keep allocations consistent with total stock (audit W2): the shelf count and the sum of dated batches
// can never exceed the total qty. After any decrement (sale/waste/count) we cap shelfQty and trim excess
// dated units — latest-expiry first, so the most-urgent earliest-expiry batch stays represented — instead
// of leaving "phantom" dated/shelf units above the real total.
export function reconcileAllocations(p) {
  const qty = Math.max(0, Number(p.qty) || 0);
  let out = p;
  if (shelfTracked(out) && shelfQtyOf(out) > qty) out = { ...out, shelfQty: qty };
  const batches = batchesOf(out);
  const sum = batches.reduce((n, b) => n + (Number(b.qty) || 0), 0);
  if (sum > qty) {
    let excess = sum - qty;
    const order = [...batches].sort((a, b) => String(b.expiry || '').localeCompare(String(a.expiry || '')));
    const trim = new Map();
    for (const b of order) {
      if (excess <= 0) break;
      const take = Math.min(excess, Number(b.qty) || 0);
      trim.set(b.id, (Number(b.qty) || 0) - take);
      excess -= take;
    }
    out = {
      ...out,
      batches: batches
        .map((b) => (trim.has(b.id) ? { ...b, qty: trim.get(b.id) } : b))
        .filter((b) => (Number(b.qty) || 0) > 0),
    };
  }
  return out;
}
export function batchExpiryInfo(batch, from = new Date()) {
  return expiryInfo({ expiry: batch.expiry, dateType: batch.dateType }, from);
}

/** Most-urgent expiry across the product's own date AND every dated batch (audit W3): callers that only
 *  looked at p.expiry missed an expired batch. Returns an expiryInfo (with mustPull/status) or null. */
export function worstExpiry(p, from = new Date()) {
  const candidates = [];
  if (p && p.expiry) { const ei = expiryInfo(p, from); if (ei) candidates.push(ei); }
  for (const b of batchesOf(p)) {
    if (b && b.expiry) { const ei = expiryInfo({ expiry: b.expiry, dateType: b.dateType }, from); if (ei) candidates.push(ei); }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => (Number(b.mustPull) - Number(a.mustPull)) || (a.daysLeft - b.daysLeft));
  return candidates[0];
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

// Every scannable code a product answers to: its single barcode, its outer/case barcode, and any extra
// barcodes (a product line can ship under several EANs; a supplier's case sticker differs again). Used by
// matching + duplicate detection so a second barcode still resolves to the one product (Phase 2.7a).
export function codesOf(p) {
  const out = [];
  const main = (p && p.barcode || '').trim(); if (main) out.push(main);
  const cse = (p && p.caseBarcode || '').trim(); if (cse) out.push(cse);
  for (const c of (Array.isArray(p && p.extraBarcodes) ? p.extraBarcodes : [])) {
    const code = String(c || '').trim(); if (code) out.push(code);
  }
  return out;
}

/** Clean an extra-barcode list: trimmed, non-empty, de-duped, and excluding the main/case codes. */
function normaliseExtraBarcodes(arr, primary, caseBc) {
  const seen = new Set([primary, caseBc].filter(Boolean));
  const out = [];
  for (const c of (Array.isArray(arr) ? arr : [])) {
    const code = String(c || '').trim();
    if (!code || seen.has(code)) continue;
    seen.add(code); out.push(code);
  }
  return out;
}

function normaliseNew(p) {
  const barcode = (p.barcode || '').trim();
  const caseBarcode = (p.caseBarcode || '').trim() || null;
  return {
    id: newId(),
    barcode,
    // A product is identified by its barcode. category + packSize + caseBarcode are what turn a bare
    // code into something the shop can act on: what kind of thing it is, and whether a scan is one unit
    // or a whole case. None of this lives in the barcode itself — it's the shop's own record.
    caseBarcode,                                        // outer/case barcode; scanning it books a full case
    extraBarcodes: normaliseExtraBarcodes(p.extraBarcodes, barcode, caseBarcode), // additional EANs (2.7a)
    supplierAliases: Array.isArray(p.supplierAliases) ? p.supplierAliases : [],    // supplier code/name (2.7b)
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
  // Prefer a single-barcode match; then a case-barcode match; then any extra barcode (as a single unit).
  const bySingle = list.find((p) => (p.barcode || '') === code);
  if (bySingle) return { product: bySingle, unit: 'single', multiplier: 1 };
  const byCase = list.find((p) => (p.caseBarcode || '') === code);
  if (byCase) return { product: byCase, unit: 'case', multiplier: normalisePackSize(byCase.packSize) || 1 };
  const byExtra = list.find((p) => Array.isArray(p.extraBarcodes) && p.extraBarcodes.includes(code));
  if (byExtra) return { product: byExtra, unit: 'single', multiplier: 1 };
  return null;
}

/** The product (if any) already using this code in ANY of its barcode slots — used to prevent linking a
 *  code that belongs to a different product. Returns the product or null. */
export function productByAnyCode(products, rawCode, { exceptId } = {}) {
  const code = String(rawCode || '').trim();
  if (!code) return null;
  return (Array.isArray(products) ? products : []).find((p) => p.id !== exceptId && codesOf(p).includes(code)) || null;
}

const normName = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Match a product by a SUPPLIER'S OWN code or name for it (Phase 2.7b) — the thing a supplier's invoice
 * calls a product, which is neither its barcode nor your shelf name. Optionally scoped to a supplier.
 * Returns the product or null.
 */
export function matchBySupplierAlias(products, { code = '', name = '', supplierId = null } = {}) {
  const c = String(code || '').trim();
  const n = normName(name);
  if (!c && !n) return null;
  for (const p of (Array.isArray(products) ? products : [])) {
    for (const a of (Array.isArray(p.supplierAliases) ? p.supplierAliases : [])) {
      if (supplierId && a.supplierId && a.supplierId !== supplierId) continue;
      if (c && String(a.code || '').trim() === c) return p;
      if (n && normName(a.name) === n) return p;
    }
  }
  return null;
}

/**
 * Find likely duplicate products for a REVIEWABLE merge (Phase 2.7e) — never merges automatically.
 * Groups two+ products that either share a barcode (strong) or have the same normalised name (likely).
 * Returns [{ key, reason:'barcode'|'name', products:[...] }], biggest/strongest first.
 */
export function findDuplicateProducts(products) {
  const list = Array.isArray(products) ? products : [];
  const groups = [];
  const seenKeys = new Set();
  const pushGroup = (reason, members) => {
    if (members.length < 2) return;
    const key = `${reason}:${members.map((p) => p.id).sort().join('|')}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    groups.push({ key, reason, products: members });
  };
  // Shared barcode (any code in common).
  const byCode = new Map();
  for (const p of list) for (const c of codesOf(p)) {
    if (!byCode.has(c)) byCode.set(c, new Map());
    byCode.get(c).set(p.id, p);
  }
  for (const m of byCode.values()) if (m.size > 1) pushGroup('barcode', [...m.values()]);
  // Same normalised name.
  const byName = new Map();
  for (const p of list) {
    const n = normName(p.name);
    if (!n || n === 'unnamed item') continue;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(p);
  }
  for (const members of byName.values()) pushGroup('name', members);
  // Strong (barcode) matches first.
  return groups.sort((a, b) => (a.reason === b.reason ? 0 : a.reason === 'barcode' ? -1 : 1));
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
      const merged = { ...p, ...patch, updatedAt: Date.now() };
      return delta < 0 ? reconcileAllocations(merged) : merged; // trim phantom allocations on a decrease (W2)
    });
    const res = persist(next);
    if (!res.ok) return null; // couldn't save — don't log a phantom movement (audit W1)
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
   * Merge a duplicate product into the one being kept (Phase 2.7e/f). Unions barcodes + supplier aliases,
   * sums stock + shelf + batches, fills blank fields from the dropped one, then re-points ALL history
   * (movements, claims, price alerts, invoice + delivery lines) from the dropped id to the kept id so
   * nothing is stranded, and removes the dropped product. Returns { ok, merged, remap }.
   */
  const mergeProducts = useCallback((keepId, dropId) => {
    if (!keepId || !dropId || keepId === dropId) return { ok: false, error: 'Pick two different products' };
    const prev = load();
    const keep = prev.find((p) => p.id === keepId);
    const drop = prev.find((p) => p.id === dropId);
    if (!keep || !drop) return { ok: false, error: 'Product not found' };

    const extraBarcodes = normaliseExtraBarcodes(
      [...(keep.extraBarcodes || []), drop.barcode, drop.caseBarcode, ...(drop.extraBarcodes || [])],
      keep.barcode, keep.caseBarcode,
    );
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const shelfTrackedEither = keep.shelfQty != null || drop.shelfQty != null;
    const merged = {
      ...keep,
      qty: num(keep.qty) + num(drop.qty),
      extraBarcodes,
      supplierAliases: [...(keep.supplierAliases || []), ...(drop.supplierAliases || [])],
      caseBarcode: keep.caseBarcode || drop.caseBarcode || null,
      packSize: keep.packSize || drop.packSize || null,
      category: keep.category || drop.category || null,
      cost: keep.cost == null || keep.cost === '' ? drop.cost : keep.cost,
      price: keep.price == null || keep.price === '' ? drop.price : keep.price,
      supplierId: keep.supplierId || drop.supplierId || null,
      batches: [...batchesOf(keep), ...batchesOf(drop)],
      shelfQty: shelfTrackedEither ? num(keep.shelfQty) + num(drop.shelfQty) : null,
      countedAt: Math.max(keep.countedAt || 0, drop.countedAt || 0) || keep.countedAt || drop.countedAt || null,
      lastSoldAt: Math.max(keep.lastSoldAt || 0, drop.lastSoldAt || 0) || keep.lastSoldAt || drop.lastSoldAt || null,
      updatedAt: Date.now(),
    };
    const next = prev.filter((p) => p.id !== dropId).map((p) => (p.id === keepId ? merged : p));
    const res = persist(next);
    if (!res.ok) return { ok: false, error: res.error || 'Couldn’t save on this device' };
    setProducts(next);
    // Re-point history AFTER the product records are safely saved (stock union is bookkeeping, not a new
    // movement — the kept product now carries both products' ledgers via the remap).
    const remap = reassignProductRefs(dropId, keepId);
    return { ok: true, merged, remap };
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
    const next = prev.map((x) => (x.id === id ? reconcileAllocations({ ...x, qty: (Number(x.qty) || 0) - sold, lastSoldAt: Date.now(), updatedAt: Date.now() }) : x));
    const res = persist(next);
    if (!res.ok) return { ok: false, error: res.error || 'Couldn’t save the sale on this device' }; // don't log a movement we couldn't persist (audit W1)
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
    const next = prev.map((x) => (x.id === id ? reconcileAllocations({ ...x, qty: (Number(x.qty) || 0) - applied, updatedAt: Date.now() }) : x));
    const res = persist(next);
    if (!res.ok) return { ok: false, error: res.error || 'Couldn’t save on this device' };
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
    // Keep history: append a compensating correction rather than deleting the waste movement (Phase 1.2d).
    if (opGroupId) reverseByBatch(opGroupId, { reason: 'waste undone' });
    return { ok: true };
  }, []);

  /** Reverse a waste event (undo): restore stock and record a compensating correction (history kept). */
  const reverseWaste = useCallback(({ id, qty, batchId }) => {
    const restore = Math.max(0, Number(qty) || 0);
    const prev = load();
    const next = prev.map((x) => (x.id === id ? { ...x, qty: (Number(x.qty) || 0) + restore, updatedAt: Date.now() } : x));
    persist(next);
    setProducts(next);
    if (batchId) reverseByBatch(batchId, { reason: 'waste undone' });
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
    return load().find((p) => codesOf(p).includes(b)) || null;
  }, []);

  /** Link an extra barcode to an existing product (Phase 2.7a). Refuses a blank code or one already used by
   *  a DIFFERENT product (no silent shadowing). Returns { ok, error? }. */
  const addBarcode = useCallback((id, rawCode) => {
    const code = String(rawCode || '').trim();
    if (!code) return { ok: false, error: 'Enter a barcode' };
    const prev = load();
    const clash = productByAnyCode(prev, code, { exceptId: id });
    if (clash) return { ok: false, error: `That barcode already belongs to ${clash.name}` };
    const target = prev.find((p) => p.id === id);
    if (!target) return { ok: false, error: 'Product not found' };
    if (codesOf(target).includes(code)) return { ok: true }; // already linked here — no-op
    const next = prev.map((p) => (p.id === id
      ? { ...p, extraBarcodes: [...(Array.isArray(p.extraBarcodes) ? p.extraBarcodes : []), code], updatedAt: Date.now() }
      : p));
    const res = persist(next);
    if (!res.ok) return { ok: false, error: res.error || 'Couldn’t save on this device' };
    setProducts(next);
    return { ok: true };
  }, []);

  /** Remove an extra barcode from a product. */
  const removeBarcode = useCallback((id, rawCode) => {
    const code = String(rawCode || '').trim();
    const next = load().map((p) => (p.id === id
      ? { ...p, extraBarcodes: (Array.isArray(p.extraBarcodes) ? p.extraBarcodes : []).filter((c) => c !== code), updatedAt: Date.now() }
      : p));
    persist(next); setProducts(next);
    return { ok: true };
  }, []);

  // Richer resolve used by the Scan tab: returns { product, unit:'single'|'case', multiplier } or null,
  // so a scan of the outer case barcode is understood as a full case.
  const matchByBarcode = useCallback((barcode) => matchBarcode(load(), barcode), []);

  /** Book in `units` of a known product by id (scan-in). Increases stock and logs GOODS_RECEIVED. Used by
   *  the Scan tab, where scanning a case books in units = count × packSize. Returns { ok, added }. */
  const bookIn = useCallback((id, units) => {
    const add = Math.max(0, Math.round(Number(units) || 0));
    if (add <= 0) return { ok: false, error: 'Quantity must be positive' };
    const prev = load();
    const p = prev.find((x) => x.id === id);
    if (!p) return { ok: false, error: 'Product not found' };
    const next = prev.map((x) => (x.id === id ? { ...x, qty: (Number(x.qty) || 0) + add, updatedAt: Date.now() } : x));
    const res = persist(next);
    if (!res.ok) return { ok: false, error: res.error || 'Couldn’t save on this device' };
    setProducts(next);
    recordMovement({ productId: id, type: MOVEMENT_TYPES.GOODS_RECEIVED, delta: add, reason: 'scan-in' });
    return { ok: true, added: add };
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

    // Audit D1: do NOT record the goods-received ledger or report success unless the stock write actually
    // committed. If persist fails (quota with no IndexedDB, etc.), return the failure so the caller does not
    // mark the delivery received — and since no operationId movement is written, the owner can retry cleanly.
    // (overflow is still ok:true — IndexedDB holds it durably.)
    const saved = persist(next);
    if (!saved.ok) return { ok: false, applied: 0, error: saved.error || 'Couldn’t save received stock — please retry.' };
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
      const appliedDelta = newQty - current;              // what ACTUALLY changed (audit W6: log this, not the raw variance)
      if (appliedDelta !== 0) changes.push({ id: p.id, delta: appliedDelta, variance: delta, reason: it.reason || '' });
      const updated = { ...p, qty: newQty, countedAt: now, updatedAt: now };
      return appliedDelta < 0 ? reconcileAllocations(updated) : updated;
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
   * Apply stocktake counts by id→target-qty. Thin wrapper over applyCounts (Phase 2.8f): the old blind
   * overwrite bypassed snapshot-safety and never set countedAt, so it's gone — this routes through the one
   * safe path (correction logged as STOCK_ADJUSTMENT, marks countedAt). Kept for API/back-compat.
   */
  const setCounts = useCallback((counts) => {
    const items = Object.keys(counts || {}).map((id) => ({ id, counted: counts[id] }));
    return applyCounts(items);
  }, [applyCounts]);

  const commit = useCallback((nextProducts) => {
    persist(nextProducts);
    setProducts(nextProducts);
  }, []);

  return {
    products,
    workspace: getActiveWorkspace(),
    addProduct, updateProduct, removeProduct, mergeProducts,
    addBarcode, removeBarcode,
    sellUnits, recordWaste, reverseWaste,
    addBatch, wasteBatch, reverseBatchWaste,
    setCounts, applyCounts, setShelfQty, transferStock,
    findByBarcode, matchByBarcode, bookIn, receiveLines, applyDelivery, importProducts, commit,
  };
}
