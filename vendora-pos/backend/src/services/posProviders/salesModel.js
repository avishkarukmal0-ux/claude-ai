'use strict';

// Shared, provider-agnostic SALES MODEL — the one normalized shape every POS adapter maps its native data
// into, so the (future) stock-deduction engine never has to know a provider's quirks. Pure + framework-free.
//
// Design rules this encodes (from the integration brief + the shop's existing stock model):
//  - MONEY is integer MINOR units (pence) — never a float. A payment amount ALONE never deducts stock.
//  - QUANTITY is a decimal with an explicit UNIT (each/kg/g/litre/case/pack). Weighted goods are first-class.
//  - Every sale and line carries a STABLE provider id; the dedupe key derived here is what makes retries,
//    repeated files, reconnects and overlapping historical imports idempotent (it becomes the movement
//    operationId — see movementStore.hasOperation).
//  - RETURNS are their own line kind, separate from a sale, so a refund never implies a restock by itself.
//  - Nothing here mutates stock. This module only shapes + validates data.

// ── Enums ───────────────────────────────────────────────────────────────────
const SALE_STATUS = Object.freeze({
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
});
const LINE_KIND = Object.freeze({ SALE: 'sale', RETURN: 'return' });
const UNIT = Object.freeze({ EACH: 'each', KG: 'kg', G: 'g', L: 'litre', ML: 'ml', CASE: 'case', PACK: 'pack' });
const VALID_UNITS = new Set(Object.values(UNIT));
const VALID_STATUSES = new Set(Object.values(SALE_STATUS));

// ── Numeric handling ──────────────────────────────────────────────────────────
/** Money → integer minor units (pence). Accepts a major-unit number/string ("1.20" → 120) or an explicit
 *  already-minor integer via { minor }. Returns null when unknown/blank (unknown money is NOT zero). */
function toMinorUnits(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && value.minor != null) {
    const m = Number(value.minor);
    return Number.isFinite(m) ? Math.round(m) : null;
  }
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100); // 2dp currency (GBP); round half-up on the minor unit
}

/** Quantity as a decimal, rounded to 3dp to kill float drift on weighted goods. Blank/non-numeric → null
 *  (a missing quantity is unknown, never 0 — the engine routes it to review rather than deducting nothing). */
function normalizeQty(value) {
  if (typeof value !== 'number') {
    const cleaned = String(value == null ? '' : value).replace(/[^0-9.\-]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
    value = Number(cleaned);
  }
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function normalizeUnit(u) {
  const s = String(u || '').trim().toLowerCase();
  if (VALID_UNITS.has(s)) return s;
  if (s === 'ea' || s === 'unit' || s === 'units' || s === 'pcs' || s === '') return UNIT.EACH;
  if (s === 'kilogram' || s === 'kilo' || s === 'kgs') return UNIT.KG;
  if (s === 'litres' || s === 'l') return UNIT.L;
  return UNIT.EACH; // unknown unit defaults to each but the caller should route weighted ambiguity to review
}

// ── Identity / dedupe ─────────────────────────────────────────────────────────
/** Stable key for a whole sale across retries/reconnects/re-imports: provider + merchant + transaction id. */
function saleKey(sale) {
  if (!sale || !sale.provider || sale.saleId == null) return null;
  return `${sale.provider}:${sale.merchantId || '_'}:${sale.saleId}`;
}
/** Stable key for one line within a sale (for per-line idempotency when a sale is amended line-by-line). */
function lineKey(sale, line) {
  const sk = saleKey(sale);
  if (!sk || !line) return null;
  return `${sk}:${line.lineId != null ? line.lineId : `${line.kind || 's'}:${(line.productRef && (line.productRef.barcode || line.productRef.sku || line.productRef.productId)) || '?'}`}`;
}

// ── Build / validate ───────────────────────────────────────────────────────────
/** A product reference carries whatever the provider gave us; matching to a Vendora product happens later and
 *  NEVER by name alone (name is advisory only). */
function productRef({ productId = null, barcode = null, sku = null, name = null } = {}) {
  const clean = (v) => (v == null ? null : String(v).trim() || null);
  return { productId: clean(productId), barcode: clean(barcode), sku: clean(sku), name: clean(name) };
}

function makeLine({ lineId = null, kind = LINE_KIND.SALE, qty, unit = UNIT.EACH, amount = null, packSize = null, ref = {} } = {}) {
  const k = kind === LINE_KIND.RETURN ? LINE_KIND.RETURN : LINE_KIND.SALE;
  return {
    lineId: lineId == null ? null : String(lineId),
    kind: k,
    productRef: productRef(ref),
    qty: normalizeQty(qty),
    unit: normalizeUnit(unit),
    amountMinor: toMinorUnits(amount),
    packSize: packSize == null ? null : (Number(packSize) || null),
  };
}

/**
 * Normalize a sale into the canonical shape. `saleAt`/`importedAt` are epoch ms. Returns the sale plus a
 * `key` (dedupe) and `issues[]` (lines that need review — a null/zero qty, an unresolved weighted unit, or a
 * line with no usable product reference). The engine must route `issues` to manual review, never guess.
 */
function makeSale({
  provider, merchantId = null, locationId = null, tillId = null,
  saleId, status = SALE_STATUS.COMPLETED, saleAt = null, importedAt = Date.now(),
  currency = 'GBP', lines = [], source = {},
} = {}) {
  const sale = {
    provider: provider || null,
    merchantId: merchantId == null ? null : String(merchantId),
    locationId: locationId == null ? null : String(locationId),
    tillId: tillId == null ? null : String(tillId),
    saleId: saleId == null ? null : String(saleId),
    status: VALID_STATUSES.has(status) ? status : SALE_STATUS.COMPLETED,
    saleAt: Number.isFinite(Number(saleAt)) ? Number(saleAt) : null,
    importedAt: Number.isFinite(Number(importedAt)) ? Number(importedAt) : Date.now(),
    currency: String(currency || 'GBP').toUpperCase(),
    lines: (Array.isArray(lines) ? lines : []).map((l) => (l && l.productRef ? l : makeLine(l))),
    source: { method: (source && source.method) || null, ref: (source && source.ref) || null },
  };
  sale.key = saleKey(sale);
  sale.issues = [];
  if (!sale.provider || !sale.saleId) sale.issues.push({ code: 'no_sale_id', message: 'Missing provider/transaction id' });
  for (const l of sale.lines) {
    const r = l.productRef || {};
    if (!r.productId && !r.barcode && !r.sku) sale.issues.push({ code: 'unmatched', lineId: l.lineId, message: 'No barcode/SKU/product id to match on (name alone is never matched)' });
    if (l.qty == null || l.qty <= 0) sale.issues.push({ code: 'bad_qty', lineId: l.lineId, message: 'Missing or non-positive quantity' });
    if ((l.unit === UNIT.KG || l.unit === UNIT.G || l.unit === UNIT.L || l.unit === UNIT.ML) && l.qty != null && !Number.isInteger(l.qty)) {
      // weighted sale — fine, but flag so the matcher confirms the product is sold by that unit
      sale.issues.push({ code: 'weighted', lineId: l.lineId, message: `Weighted quantity (${l.qty}${l.unit}) — confirm the product is sold by weight` });
    }
  }
  return sale;
}

/** A sale is safe to deduct stock from only when it is COMPLETED, has sale lines and no blocking issues. A
 *  bad_qty or unmatched issue blocks; a `weighted` flag is advisory (goes to review, doesn't hard-block). */
function isStockEligible(sale) {
  if (!sale || sale.status !== SALE_STATUS.COMPLETED) return false;
  if (!Array.isArray(sale.lines) || !sale.lines.length) return false;
  return !(sale.issues || []).some((i) => i.code === 'bad_qty' || i.code === 'unmatched' || i.code === 'no_sale_id');
}

module.exports = {
  SALE_STATUS, LINE_KIND, UNIT,
  toMinorUnits, normalizeQty, normalizeUnit,
  saleKey, lineKey, productRef, makeLine, makeSale, isStockEligible,
};
