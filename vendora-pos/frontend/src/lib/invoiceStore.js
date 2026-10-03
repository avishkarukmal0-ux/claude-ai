// Supplier invoice capture (Phase 1). Local-first, workspace-scoped. A captured invoice holds the
// supplier/reference/date and its product lines (qty, pack size, cost), plus a reference to the raw file
// (photo/PDF). METADATA + lines live in `invoices_v1` (synced like every other store); the raw FILE lives
// in `invoice_files_v1` which is on-device only (files are multi-MB — too big to sync through the per-store
// blob cap). OCR is optional and behind config (invoiceOcr.js); with no provider the review screen is
// manual entry. Nothing is ever auto-committed — the owner reviews and confirms every field.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON, read, write, removeKey, getActiveWorkspace } from './storage';
import { matchBarcode, matchBySupplierAlias } from './inventoryStore';
import { round2 as r2, sumMoney } from './money';

const NAME = 'invoices_v1';
const FILES = 'invoice_files_v1'; // local-only (not in STORE_NAMES)

function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function persist(list) { return writeJSON(NAME, list); }
function newId(p = 'inv') {
  try { if (crypto?.randomUUID) return `${p}_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// --- pack/unit normalisation (shared with reconciliation) ------------------
/** Units in a line regardless of how it's expressed: cases × packSize, or a raw unit count. */
export function lineUnits(line) {
  const pack = Math.max(1, Math.round(n(line.packSize)) || 1);
  if (line.qtyMode === 'cases') return n(line.qty) * pack;
  return n(line.qty);
}
/** Cost per single unit, normalised from a case cost or a unit cost. */
export function lineUnitCost(line) {
  const pack = Math.max(1, Math.round(n(line.packSize)) || 1);
  if (line.qtyMode === 'cases' && n(line.caseCost) > 0) return r2(n(line.caseCost) / pack);
  if (n(line.unitCost) > 0) return r2(n(line.unitCost));
  if (n(line.caseCost) > 0) return r2(n(line.caseCost) / pack);
  return 0;
}
/** Line total = what the invoice charges for this line. Audit D4: keep full precision through the division and
 *  round only the FINAL total — never the per-unit cost first (£10/24 × 24 must be £10.00, not £10.08). For a
 *  case purchase the authoritative figure is the whole-case cost × number of cases. */
export function lineTotal(line) {
  if (n(line.lineTotal) > 0) return r2(line.lineTotal);
  const pack = Math.max(1, Math.round(n(line.packSize)) || 1);
  if (line.qtyMode === 'cases' && n(line.caseCost) > 0) return r2(n(line.caseCost) * n(line.qty));
  if (n(line.unitCost) > 0) return r2(n(line.unitCost) * lineUnits(line));
  if (n(line.caseCost) > 0) return r2((n(line.caseCost) / pack) * lineUnits(line));
  return 0;
}

// --- untrusted upload validation (Phase 2) ---------------------------------
// A captured invoice file is untrusted input. Validate its type + size on the device before we read or
// store it (the server re-validates independently). Pure + testable.
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_UPLOAD = /^(image\/|application\/pdf$)/i;
/** @returns {{ok:true,isPdf:boolean}|{ok:false,error:string}} */
export function validateInvoiceFile(file) {
  if (!file) return { ok: false, error: 'No file selected' };
  const type = String(file.type || '');
  const isPdf = /pdf$/i.test(type) || /\.pdf$/i.test(file.name || '');
  if (!ALLOWED_UPLOAD.test(type) && !isPdf) return { ok: false, error: 'Upload a photo (JPG/PNG) or a PDF' };
  if (Number(file.size) > MAX_UPLOAD_BYTES) return { ok: false, error: 'That file is too large — keep it under 8 MB' };
  return { ok: true, isPdf };
}

// --- dedupe ----------------------------------------------------------------
/** A stable fingerprint of an invoice's identity for duplicate detection. */
export function invoiceFingerprint(inv) {
  const sup = (inv.supplierName || inv.supplierId || '').trim().toLowerCase();
  const ref = (inv.reference || '').trim().toLowerCase();
  const day = inv.date ? new Date(inv.date).toISOString().slice(0, 10) : '';
  const total = invoiceTotal(inv).toFixed(2);
  return `${sup}|${ref}|${day}|${total}`;
}
/** Find an already-stored invoice that looks like a duplicate of `inv` (same fingerprint, different id). */
export function findDuplicateInvoice(inv, existing = load()) {
  const fp = invoiceFingerprint(inv);
  return existing.find((x) => x.id !== inv.id && invoiceFingerprint(x) === fp) || null;
}

export function invoiceTotal(inv) {
  if (n(inv.total) > 0) return r2(inv.total);
  return sumMoney((inv.lines || []).map((l) => lineTotal(l)));
}

// --- product matching (reuse the inventory barcode/name resolver) ----------
/** Match each line to a product by barcode, supplier alias, then name; marks `matched`/`productId`. Pure.
 *  Pass the invoice's supplierId to scope alias matching to that supplier when known. */
export function matchLines(lines, products, { supplierId = null } = {}) {
  const byName = new Map();
  for (const p of products) if (p.name) byName.set(String(p.name).trim().toLowerCase(), p);
  return lines.map((l) => {
    let product = null;
    if (l.barcode) { const m = matchBarcode(products, l.barcode); if (m) product = m.product; }
    // A supplier's own code/name for the product (Phase 2.7b) — resolves lines that carry neither the
    // barcode nor your shelf name.
    if (!product && (l.barcode || l.name)) product = matchBySupplierAlias(products, { code: l.barcode, name: l.name, supplierId: supplierId || null });
    if (!product && l.name) product = byName.get(String(l.name).trim().toLowerCase()) || null;
    return { ...l, productId: product ? product.id : null, matched: !!product };
  });
}

// --- payment helpers (Phase 5, pure) ---------------------------------------
/** Total paid so far against an invoice (sum of partial payments), decimal-safe. */
export function invoicePaid(inv) { return sumMoney((inv && inv.payments ? inv.payments : []).map((p) => p.amount)); }
/** Amount still owed = total − paid, floored at 0. Returns null if the invoice has no total recorded. */
export function invoiceOwed(inv) {
  const total = inv && inv.total != null ? r2(inv.total) : invoiceTotal(inv);
  if (!(total > 0)) return null; // unknown total → can't say what's owed
  return r2(Math.max(0, total - invoicePaid(inv)));
}
/** 'paid' | 'partial' | 'unpaid' | 'unknown' (no total). */
export function invoicePaymentStatus(inv) {
  const total = inv && inv.total != null ? r2(inv.total) : invoiceTotal(inv);
  if (!(total > 0)) return 'unknown';
  const paid = invoicePaid(inv);
  if (paid <= 0) return 'unpaid';
  if (paid + 0.005 >= total) return 'paid';
  return 'partial';
}

/** A clean draft line. `uncertain` flags an OCR field the user should check. */
export function blankInvoiceLine(partial = {}) {
  return {
    id: newId('il'), name: '', barcode: '', productId: null, matched: false,
    qty: '', qtyMode: 'units', packSize: '', unitCost: '', caseCost: '', lineTotal: '',
    uncertain: false, ...partial,
  };
}

// --- file storage (local-only) ---------------------------------------------
function loadFiles(ws) { try { const r = read(FILES, null, ws); return r ? JSON.parse(r) : {}; } catch { return {}; } }
function saveFiles(ws, map) { return write(FILES, JSON.stringify(map), ws); }

export function useInvoices() {
  const [invoices, setInvoices] = useState(load);

  useEffect(() => {
    const refresh = () => setInvoices(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('vendora:workspace', refresh);
    };
  }, []);

  const commitAll = (next) => { const res = persist(next); if (res.ok) setInvoices(next); return res; };

  /** Save (or update) a draft invoice. Stores the raw file on-device if provided. Returns { ok, invoice }. */
  const saveDraft = useCallback((draft, file /* { dataUrl, type } | null */) => {
    const ws = getActiveWorkspace();
    const id = draft.id || newId();
    let fileId = draft.fileId || null;
    if (file && file.dataUrl) {
      fileId = fileId || newId('if');
      const map = loadFiles(ws); map[fileId] = { dataUrl: file.dataUrl, type: file.type || 'image' };
      const fres = saveFiles(ws, map);
      if (!fres.ok) return { ok: false, error: fres.error || 'Couldn’t store the invoice file on this device' };
    }
    const inv = {
      id,
      supplierId: draft.supplierId || null,
      supplierName: (draft.supplierName || '').trim(),
      reference: (draft.reference || '').trim(),
      date: draft.date || null,
      lines: (draft.lines || []).map((l) => ({ ...l })),
      total: draft.total != null ? r2(draft.total) : undefined,
      fileId,
      fileType: file ? (file.type || 'image') : draft.fileType || null,
      source: draft.source || 'manual',
      status: draft.status === 'committed' ? 'committed' : 'draft',
      dueDate: draft.dueDate || null,            // payment due date (Phase 5), optional
      payments: Array.isArray(draft.payments) ? draft.payments : [], // [{ id, amount, at }] partial payments
      createdAt: draft.createdAt || Date.now(),
      committedAt: draft.committedAt || null,
      updatedAt: Date.now(),
    };
    const next = [inv, ...load().filter((x) => x.id !== id)];
    const res = commitAll(next);
    return res.ok ? { ok: true, invoice: inv } : res;
  }, []);

  /** Mark a reviewed invoice committed (its figures are now trusted for reconciliation/price history). */
  const commitInvoice = useCallback((id) => {
    const next = load().map((x) => (x.id === id ? { ...x, status: 'committed', committedAt: Date.now(), updatedAt: Date.now() } : x));
    return commitAll(next);
  }, []);

  /** Set/clear the payment due date (Phase 5). */
  const setDueDate = useCallback((id, dueDate) => {
    return commitAll(load().map((x) => (x.id === id ? { ...x, dueDate: dueDate || null, updatedAt: Date.now() } : x)));
  }, []);

  /** Record a (partial) payment against an invoice. Amount is clamped positive; status is derived. */
  const addPayment = useCallback((id, amount) => {
    const amt = r2(amount);
    if (!(amt > 0)) return { ok: false, error: 'Enter a payment amount.' };
    return commitAll(load().map((x) => (x.id === id
      ? { ...x, payments: [...(x.payments || []), { id: newId('pay'), amount: amt, at: Date.now() }], updatedAt: Date.now() }
      : x)));
  }, []);

  /** Remove a recorded payment (correction). */
  const removePayment = useCallback((id, paymentId) => {
    return commitAll(load().map((x) => (x.id === id ? { ...x, payments: (x.payments || []).filter((p) => p.id !== paymentId), updatedAt: Date.now() } : x)));
  }, []);

  const removeInvoice = useCallback((id) => {
    const ws = getActiveWorkspace();
    const inv = load().find((x) => x.id === id);
    if (inv && inv.fileId) { const map = loadFiles(ws); delete map[inv.fileId]; saveFiles(ws, map); }
    return commitAll(load().filter((x) => x.id !== id));
  }, []);

  const getFile = useCallback((fileId) => {
    if (!fileId) return null;
    return loadFiles(getActiveWorkspace())[fileId] || null;
  }, []);

  /** Delete the stored raw file but KEEP the invoice record + its figures (retention control, Phase 2).
   *  Lets an owner purge a scanned document while keeping the checked invoice for price history/claims. */
  const deleteFile = useCallback((id) => {
    const ws = getActiveWorkspace();
    const inv = load().find((x) => x.id === id);
    if (inv && inv.fileId) { const map = loadFiles(ws); delete map[inv.fileId]; saveFiles(ws, map); }
    return commitAll(load().map((x) => (x.id === id ? { ...x, fileId: null, fileType: null, updatedAt: Date.now() } : x)));
  }, []);

  const findDuplicate = useCallback((inv) => findDuplicateInvoice(inv, load()), []);

  return { invoices, saveDraft, commitInvoice, removeInvoice, getFile, deleteFile, findDuplicate, setDueDate, addPayment, removePayment };
}

// Test hook: clear invoice files for the active workspace.
export function __clearInvoiceFiles(ws = getActiveWorkspace()) { try { removeKey(FILES, ws); } catch { /* ignore */ } }
