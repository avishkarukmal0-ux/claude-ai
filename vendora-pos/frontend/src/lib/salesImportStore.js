// Optional till CSV sales import.
//
// Purpose: turn "estimated" velocity into CONFIRMED sales evidence by importing a till/EPOS
// sales export. This is strictly opt-in and DOES NOT change current stock counts — the sales
// already happened and are already reflected in the shop's counts. We only append typed
// `sale` movements so reorder/insights can trust the velocity basis ('sales' instead of
// 'estimated'). See Work-Log 2026-09-30 (movement typing) and ADR-002.
//
// Design choices (kept honest):
//  - Match rows to existing products by BARCODE first, then exact (case-insensitive) NAME.
//    Unmatched rows are reported and skipped — we never invent products from a sales file.
//  - Aggregate per product per DAY so the movement log stays bounded and velocity's span
//    calculation (which reads movement dates) stays correct.
//  - Duplicate detection via a deterministic content hash used as the movement operationId;
//    re-importing the same file is a no-op (idempotent), and the UI warns before it happens.
//  - Rows older than the movement retention window are skipped (they can't feed velocity).
//
// Framework-free core (unit-testable); a thin React hook lives at the bottom.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';
import { recordMovement, recordMany, hasOperation, removeByBatch, MOVEMENT_TYPES } from './movementStore';
import { markSold, deductImportedSales, restoreImportedSales } from './inventoryStore';

const NAME = 'sales_imports_v1';
const DAY = 86400000;
export const MAX_AGE_DAYS = 180; // matches movementStore retention — older rows can't feed velocity

const IMPORT_EVENT = 'vendora:sales_imports';

// --- CSV parsing (RFC4180-ish: quoted fields, escaped quotes, CRLF, BOM) ------------------
export function parseCSV(text) {
  if (typeof text !== 'string') return { headers: [], rows: [] };
  const s = text.replace(/^﻿/, ''); // strip BOM
  const records = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r') {
      /* handled by \n */
    } else if (c === '\n') {
      row.push(field); records.push(row); row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); records.push(row); }
  const cleaned = records.filter((r) => r.some((v) => String(v).trim() !== ''));
  if (!cleaned.length) return { headers: [], rows: [] };
  return { headers: cleaned[0].map((h) => String(h).trim()), rows: cleaned.slice(1) };
}

// --- Column guessing ---------------------------------------------------------------------
const PATTERNS = {
  barcode: [/barcode/i, /\bean\b/i, /\bupc\b/i, /\bsku\b/i, /\bplu\b/i, /product ?code/i, /item ?code/i, /^code$/i],
  name: [/name/i, /description/i, /product/i, /^item$/i, /title/i],
  qty: [/\bqty\b/i, /quantit/i, /units? ?sold/i, /\bsold\b/i, /\bunits\b/i, /\bcount\b/i, /\bpcs\b/i],
  date: [/date/i, /\btime\b/i, /\bday\b/i, /when/i],
  amount: [/amount/i, /\btotal\b/i, /\bvalue\b/i, /revenue/i, /\bgross\b/i, /\bnet\b/i, /takings/i, /\bsales\b/i],
};

/** Best-guess column indices for each field. Returns { barcode, name, qty, date, amount } as
 *  0-based indices, or -1 when no header matched. A column is never assigned to two fields. */
export function guessMapping(headers = []) {
  const map = { barcode: -1, name: -1, qty: -1, date: -1, amount: -1 };
  const norm = headers.map((h) => String(h || '').trim());
  for (const key of Object.keys(map)) {
    for (let i = 0; i < norm.length; i += 1) {
      if (map[key] !== -1) break;
      if (Object.values(map).includes(i)) continue; // already taken by another field
      if (PATTERNS[key].some((re) => re.test(norm[i]))) map[key] = i;
    }
  }
  return map;
}

// --- Value parsing -----------------------------------------------------------------------
export function parseQty(v) {
  if (v == null) return NaN;
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}
export function parseAmount(v) {
  if (v == null || String(v).trim() === '') return null;
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
/** UK-first date parsing: dd/mm/yyyy and dd-mm-yyyy handled explicitly (JS Date.parse would
 *  read them as mm/dd), then ISO / timestamps via Date.parse. Returns epoch ms or null. */
export function parseDate(v) {
  if (v == null) return null;
  const str = String(v).trim();
  if (!str) return null;
  const m = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    d = +d; mo = +mo; y = +y;
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(y, mo - 1, d);
      // Reject impossible dates: JS rolls 31/02 over to early March, so verify the parts round-trip.
      if (!Number.isNaN(dt.getTime()) && dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) {
        return dt.getTime();
      }
      return null; // a dd/mm/yyyy that looked valid but isn't a real calendar date
    }
  }
  const iso = Date.parse(str);
  return Number.isNaN(iso) ? null : iso;
}
export function dayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Deterministic 8-hex content hash (FNV-1a) over aggregated buckets — order-independent. */
export function hashRows(lines = []) {
  const basis = lines.map((l) => `${l.key}|${l.qty}|${l.day}`).sort().join(';');
  let h = 2166136261;
  for (let i = 0; i < basis.length; i += 1) { h ^= basis.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (`0000000${(h >>> 0).toString(16)}`).slice(-8);
}

/**
 * Pure analysis of a parsed CSV against the product catalogue.
 * @returns {{ importId, lines, matchedRows, unmatched, invalid, tooOld, productsMatched,
 *             unitsTotal, valueTotal, hasValue, from, to }}
 *   lines: aggregated buckets [{ productId, name, day, units, value, hasValue }] ready to write.
 */
export function buildImport({ rows = [], mapping = {}, products = [], defaultDate = null, now = Date.now() }) {
  const byBarcode = new Map();
  const byName = new Map();
  for (const p of products) {
    if (p.barcode) byBarcode.set(String(p.barcode).trim(), p);
    if (p.name) byName.set(String(p.name).trim().toLowerCase(), p);
  }
  const cell = (idx, r) => (idx != null && idx >= 0 ? String(r[idx] ?? '') : '');
  const matched = [];
  const unmatched = [];
  const invalid = [];
  let tooOld = 0;
  const cutoff = now - MAX_AGE_DAYS * DAY;

  for (const r of rows) {
    const barcode = cell(mapping.barcode, r).trim();
    const name = cell(mapping.name, r).trim();
    const qty = parseQty(cell(mapping.qty, r));
    const amount = mapping.amount >= 0 ? parseAmount(cell(mapping.amount, r)) : null;
    let ts = mapping.date >= 0 ? parseDate(cell(mapping.date, r)) : null;
    if (ts == null) ts = defaultDate;

    if (!Number.isFinite(qty) || qty <= 0) { invalid.push({ barcode, name, reason: 'qty' }); continue; }
    if (ts == null) { invalid.push({ barcode, name, reason: 'no-date' }); continue; }
    if (ts > now) { invalid.push({ barcode, name, reason: 'future' }); continue; } // a sale can't be in the future
    if (ts < cutoff) { tooOld += 1; continue; }

    let product = (barcode && byBarcode.get(barcode)) || null;
    if (!product && name) product = byName.get(name.toLowerCase()) || null;
    if (!product) { unmatched.push({ barcode, name, qty }); continue; }

    matched.push({ productId: product.id, name: product.name, qty, amount, day: dayStart(ts) });
  }

  const buckets = new Map();
  for (const mrow of matched) {
    const k = `${mrow.productId}|${mrow.day}`;
    const b = buckets.get(k) || { productId: mrow.productId, name: mrow.name, day: mrow.day, units: 0, value: 0, hasValue: false };
    b.units += mrow.qty;
    if (mrow.amount != null) { b.value += mrow.amount; b.hasValue = true; }
    buckets.set(k, b);
  }
  const lines = [...buckets.values()];
  const importId = hashRows(lines.map((b) => ({ key: b.productId, qty: b.units, day: b.day })));
  const days = lines.map((b) => b.day);

  return {
    importId,
    lines,
    matchedRows: matched.length,
    unmatched,
    invalid,
    tooOld,
    productsMatched: new Set(matched.map((m) => m.productId)).size,
    unitsTotal: matched.reduce((n, m) => n + m.qty, 0),
    valueTotal: matched.reduce((n, m) => n + (m.amount || 0), 0),
    hasValue: lines.some((b) => b.hasValue),
    from: days.length ? Math.min(...days) : null,
    to: days.length ? Math.max(...days) : null,
  };
}

/**
 * COMPARISON MODE (slice 3) — pure, writes NOTHING. Given a built import analysis and the current product
 * catalogue, produce a per-product comparison of imported sales vs current stock, plus the file-level signals
 * an owner needs before deciding whether to deduct. This is the safe on-ramp: look first, deduct later.
 *
 * @param analysis  a buildImport() result
 * @param products  current catalogue (for current qty)
 * @param openingStockAt  the deduction baseline (epoch ms) or null; sales dated before it are historical and
 *                        would NOT be deducted even once deductions are on (shown as `historicalUnits`).
 * @returns {{ rows, looksItemLevel, totalsOnly, productsMatched, importedUnits, deductibleUnits,
 *             historicalUnits, unmatched, invalid, tooOld, from, to }}
 *   rows: [{ productId, name, importedUnits, deductibleUnits, currentQty, impliedRemaining }] newest-span first
 */
export function compareImport(analysis, { products = [], openingStockAt = null } = {}) {
  const a = analysis || {};
  const lines = Array.isArray(a.lines) ? a.lines : [];
  const qtyById = new Map(products.map((p) => [p.id, Number(p.qty) || 0]));
  const nameById = new Map(products.map((p) => [p.id, p.name]));
  const cut = Number.isFinite(Number(openingStockAt)) ? Number(openingStockAt) : null;

  const per = new Map(); // productId -> { importedUnits, deductibleUnits }
  let deductibleUnits = 0;
  let historicalUnits = 0;
  for (const b of lines) {
    const deductible = cut == null ? true : (b.day >= dayStart(cut)); // a day at/after the baseline deducts
    const rec = per.get(b.productId) || { importedUnits: 0, deductibleUnits: 0 };
    rec.importedUnits += b.units;
    if (deductible) { rec.deductibleUnits += b.units; deductibleUnits += b.units; }
    else historicalUnits += b.units;
    per.set(b.productId, rec);
  }

  const rows = [...per.entries()].map(([productId, v]) => {
    const currentQty = qtyById.get(productId) || 0;
    return {
      productId,
      name: nameById.get(productId) || productId,
      importedUnits: v.importedUnits,
      deductibleUnits: v.deductibleUnits,
      currentQty,
      // What stock WOULD read after deducting the deductible units, never below zero (we never invent negatives).
      impliedRemaining: Math.max(0, currentQty - v.deductibleUnits),
    };
  }).sort((x, y) => y.importedUnits - x.importedUnits);

  // Item-level iff the file produced at least one matchable item row (matched buckets OR unmatched item rows).
  // A totals/summary report (no per-item columns) yields none → we must never deduct from it.
  const looksItemLevel = lines.length > 0 || (a.unmatched && a.unmatched.length > 0);

  return {
    rows,
    looksItemLevel,
    totalsOnly: !looksItemLevel,
    productsMatched: a.productsMatched || 0,
    importedUnits: a.unitsTotal || 0,
    deductibleUnits,
    historicalUnits,
    unmatched: a.unmatched || [],
    invalid: a.invalid || [],
    tooOld: a.tooOld || 0,
    from: a.from || null,
    to: a.to || null,
  };
}

// --- persistence -------------------------------------------------------------------------
function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function persist(arr) { return writeJSON(NAME, arr); }
function bump() { try { window.dispatchEvent(new CustomEvent(IMPORT_EVENT)); } catch { /* ignore */ } }

/** True if this exact content was already imported (history OR movement log). */
export function isDuplicateImport(importId) {
  if (!importId) return false;
  return load().some((im) => im.importId === importId) || hasOperation(importId);
}

/** React hook: import history + apply/undo. */
export function useSalesImport() {
  const [imports, setImports] = useState(load);
  useEffect(() => {
    const refresh = () => setImports(load());
    window.addEventListener(IMPORT_EVENT, refresh);
    window.addEventListener('vendora:workspace', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(IMPORT_EVENT, refresh);
      window.removeEventListener('vendora:workspace', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const isDuplicate = useCallback((importId) => isDuplicateImport(importId), []);

  /**
   * Apply an import. Two modes, both idempotent via `operationId = importId` (a given file applies once):
   *   - VELOCITY (default): write typed `sale` movements as evidence. Does NOT touch inventory quantities
   *     ("the sale already happened and is reflected in the counts").
   *   - DEDUCT (opts.deduct, opt-in): completed sales dated at/after the opening baseline (opts.cutoff)
   *     actually reduce `qty` AND log the SALE movement, via inventoryStore.deductImportedSales. Sales BEFORE
   *     the baseline are historical and never deducted. Requires a cutoff; refuses a totals-only file.
   */
  const applyImport = useCallback((analysis, meta = {}, opts = {}) => {
    const { deduct = false, cutoff = null } = opts;
    if (!analysis || !Array.isArray(analysis.lines) || !analysis.lines.length) {
      return { ok: false, reason: 'empty' }; // no item-level lines (e.g. a totals-only report) → nothing to apply
    }
    if (hasOperation(analysis.importId)) return { ok: false, reason: 'duplicate' };
    // chronological order keeps the retention prune sensible
    const ordered = [...analysis.lines].sort((a, b) => a.day - b.day);
    const reason = meta.fileName ? `Till import — ${meta.fileName}` : 'Till import';
    const baseEntry = {
      id: analysis.importId,
      importId: analysis.importId,
      fileName: meta.fileName || 'till-sales.csv',
      appliedAt: Date.now(),
      productsMatched: analysis.productsMatched,
      unitsTotal: analysis.unitsTotal,
      valueTotal: analysis.valueTotal,
      hasValue: analysis.hasValue,
      unmatchedCount: analysis.unmatched.length,
      from: analysis.from,
      to: analysis.to,
    };

    if (deduct) {
      if (cutoff == null) return { ok: false, reason: 'no-baseline' }; // deductions must have an opening baseline
      const deductible = ordered.filter((b) => b.day >= dayStart(cutoff));
      if (!deductible.length) return { ok: false, reason: 'all-historical' }; // everything predates the baseline
      const res = deductImportedSales(
        deductible.map((b) => ({ productId: b.productId, units: b.units, value: b.value, hasValue: b.hasValue, at: b.day + 12 * 3600 * 1000 })),
        { operationId: analysis.importId, batchId: analysis.importId, reason },
      );
      if (!res.ok) return { ok: false, reason: res.reason || 'save-failed', deducted: 0 };
      const entry = { ...baseEntry, mode: 'deduct', deducted: true, openingStockAt: cutoff, unitsDeducted: res.deducted, productsDeducted: res.products };
      const next = [entry, ...load().filter((im) => im.importId !== analysis.importId)];
      persist(next); setImports(next); bump();
      return { ok: true, deducted: res.deducted, products: res.products };
    }

    // VELOCITY: write ALL the movements in one atomic persist — a partial write would block retry via the
    // operationId guard yet leave an incomplete sales history (audit W10).
    const res = recordMany(ordered.map((b) => ({
      productId: b.productId,
      type: MOVEMENT_TYPES.SALE,
      delta: -Math.abs(b.units),
      valuation: b.hasValue ? b.value : undefined,
      reason,
      batchId: analysis.importId,     // lets undoImport reverse via removeByBatch
      operationId: analysis.importId, // idempotency guard (hasOperation)
      at: b.day + 12 * 3600 * 1000,   // midday of that day
    })));
    if (!res.ok) return { ok: false, reason: 'save-failed', written: 0 };
    const written = res.written;

    // W12: imported sales are real evidence of selling — update each product's lastSoldAt (no qty change,
    // no extra movement) so it isn't still flagged "never sold" / slow stock.
    const latestSold = {};
    for (const b of ordered) {
      const ts = b.day + 12 * 3600 * 1000;
      if (!latestSold[b.productId] || ts > latestSold[b.productId]) latestSold[b.productId] = ts;
    }
    try { markSold(latestSold); } catch { /* lastSoldAt is best-effort; movements already committed */ }

    const entry = { ...baseEntry, mode: 'velocity', deducted: false, movements: written };
    const next = [entry, ...load().filter((im) => im.importId !== analysis.importId)];
    persist(next);
    setImports(next);
    bump();
    return { ok: true, written };
  }, []);

  /** Reverse an import: a DEDUCTED import adds its units back to stock and removes its movements; a velocity
   *  import just removes its movements (qty was never changed). Then drop the history entry. */
  const undoImport = useCallback((importId) => {
    const entry = load().find((im) => im.importId === importId);
    let removed = 0;
    if (entry && entry.deducted) { const r = restoreImportedSales(importId); removed = r.movementsRemoved || 0; }
    else removed = removeByBatch(importId);
    const next = load().filter((im) => im.importId !== importId);
    persist(next);
    setImports(next);
    bump();
    return removed;
  }, []);

  return { imports, isDuplicate, applyImport, undoImport };
}
