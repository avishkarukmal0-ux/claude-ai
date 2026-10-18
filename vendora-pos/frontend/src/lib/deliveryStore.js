// Delivery receiving — drafts + completed deliveries, scoped to the active workspace.
//
// A delivery is a business operation with a unique id (also used as the movement operationId
// so applying it to stock is idempotent — re-submitting can't double-count). Drafts persist on
// every edit so an interruption never loses work. Cases↔units conversion is explicit.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';
import { actorName } from './actor';
import { recordTombstone } from './tombstoneStore';

const NAME = 'deliveries_v1';

function load() {
  const arr = readJSON(NAME, []);
  return Array.isArray(arr) ? arr : [];
}
function persist(list) { return writeJSON(NAME, list); }
function newId(prefix = 'dl') {
  try { if (crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const DELIVERY_ISSUES = {
  missing: { label: 'Missing', claimable: true },
  damaged: { label: 'Damaged', claimable: true },
  extra: { label: 'Extra', claimable: false },
  wrong_price: { label: 'Wrong price', claimable: true },
};

// A line can now carry SEVERAL issues (e.g. Damaged + Wrong price) as `line.issues: [{ type, qty }]`.
// Older drafts stored a single `line.issue` + `line.issueQty`; normalise both shapes to one array so every
// reader (claims, totals, the buying journey) works the same. Returns [] when there are no issues.
export function lineIssues(line) {
  const arr = Array.isArray(line.issues) ? line.issues.filter((i) => i && i.type) : [];
  if (arr.length) return arr;
  if (line.issue) return [{ type: line.issue, qty: line.issueQty }]; // legacy single-issue drafts
  return [];
}
export function hasIssue(line, type) { return lineIssues(line).some((i) => i.type === type); }

// ---- pure conversion helpers (unit-tested) --------------------------------
const n = (v) => (v === '' || v == null ? 0 : Number(v) || 0);

/** Units per outer for a line (pack/case size); 1 when receiving loose units. */
export function packSize(line) {
  const p = Number(line.packSize) || 1;
  return p > 0 ? p : 1;
}

/** Convert a quantity in the line's mode ('cases' | 'units') to individual units. */
export function toUnits(qty, line) {
  const q = n(qty);
  return line.qtyMode === 'cases' ? q * packSize(line) : q;
}

export function orderedUnits(line) { return toUnits(line.orderedQty, line); }
export function deliveredUnits(line) { return toUnits(line.deliveredQty, line); }
/** Accepted defaults to delivered when not explicitly set (whole delivery accepted). */
export function acceptedUnits(line) {
  const acc = line.acceptedQty === '' || line.acceptedQty == null ? line.deliveredQty : line.acceptedQty;
  return toUnits(acc, line);
}

/** Per-UNIT purchase cost: case cost ÷ pack size when buying cases, else the unit cost. */
export function perUnitCost(line) {
  if (line.qtyMode === 'cases' && n(line.caseCost) > 0) return n(line.caseCost) / packSize(line);
  if (n(line.unitCost) > 0) return n(line.unitCost);
  if (n(line.caseCost) > 0) return n(line.caseCost) / packSize(line);
  return 0;
}

/** Totals + discrepancy summary for a delivery. */
export function deliveryTotals(delivery) {
  const lines = delivery.lines || [];
  let acceptedUnitsTotal = 0; let cost = 0; let discrepancies = 0;
  for (const l of lines) {
    const au = acceptedUnits(l);
    acceptedUnitsTotal += au;
    cost += au * perUnitCost(l);
    const shortfall = deliveredUnits(l) < orderedUnits(l) && orderedUnits(l) > 0;
    if (lineIssues(l).length > 0 || shortfall || acceptedUnits(l) !== deliveredUnits(l)) discrepancies += 1;
  }
  return { acceptedUnits: acceptedUnitsTotal, cost: Math.round(cost * 100) / 100, discrepancies, lineCount: lines.length };
}

function blankLine(over = {}) {
  return {
    key: newId('ln'),
    barcode: '', productId: null, name: '',
    packSize: 1, qtyMode: 'units',
    orderedQty: '', deliveredQty: 1, acceptedQty: '',
    unitCost: '', caseCost: '', priorUnitCost: null,
    issues: [], note: '', photo: null,
    ...over,
  };
}

// ---- hook -----------------------------------------------------------------
export function useDeliveries() {
  const [deliveries, setDeliveries] = useState(load);

  useEffect(() => {
    const refresh = () => setDeliveries(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('vendora:workspace', refresh);
    };
  }, []);

  const createDraft = useCallback(({ supplierId = null, supplierName = '', reference = '' } = {}) => {
    const draft = {
      id: newId(),
      status: 'draft',
      supplierId, supplierName, reference,
      note: '', photos: [],
      lines: [],
      createdAt: Date.now(), updatedAt: Date.now(), receivedAt: null,
    };
    const next = [draft, ...load()];
    persist(next); setDeliveries(next);
    return draft;
  }, []);

  const updateDraft = useCallback((id, patch) => {
    const next = load().map((d) => (d.id === id && d.status === 'draft' ? { ...d, ...patch, updatedAt: Date.now() } : d));
    persist(next); setDeliveries(next);
  }, []);

  const removeDelivery = useCallback((id) => {
    const next = load().filter((d) => d.id !== id);
    persist(next); setDeliveries(next);
    recordTombstone('deliveries_v1', id); // so the delete isn't resurrected by another device's copy on merge
  }, []);

  // Audit R10 (round 3): report whether the status write committed. The caller (receiving view) applies stock
  // first (idempotent by operation id) and then finishes the document here — if THIS write fails, the delivery
  // must stay a draft AND the caller must learn it failed, so it can be finished on a retry WITHOUT re-applying
  // stock (rather than the old silent failure that left a committed delivery stuck as an un-finishable draft).
  const markReceived = useCallback((id) => {
    const who = actorName();
    const next = load().map((d) => (d.id === id
      ? { ...d, status: 'received', receivedAt: Date.now(), receivedBy: d.receivedBy || who, updatedAt: Date.now() }
      : d));
    const res = persist(next);
    if (res.ok) setDeliveries(next);
    return res;
  }, []);

  /** Clone a past delivery's lines into a fresh draft for review before confirming. */
  const repeatFrom = useCallback((sourceId) => {
    const src = load().find((d) => d.id === sourceId);
    if (!src) return null;
    const draft = {
      id: newId(), status: 'draft',
      supplierId: src.supplierId, supplierName: src.supplierName, reference: '',
      note: '', photos: [],
      lines: (src.lines || []).map((l) => blankLine({
        barcode: l.barcode, productId: l.productId, name: l.name,
        packSize: l.packSize, qtyMode: l.qtyMode,
        orderedQty: l.deliveredQty, deliveredQty: l.deliveredQty, acceptedQty: '',
        unitCost: l.unitCost, caseCost: l.caseCost,
      })),
      createdAt: Date.now(), updatedAt: Date.now(), receivedAt: null,
      repeatedFrom: sourceId,
    };
    const next = [draft, ...load()];
    persist(next); setDeliveries(next);
    return draft;
  }, []);

  return { deliveries, createDraft, updateDraft, removeDelivery, markReceived, repeatFrom, blankLine };
}

export { blankLine };
