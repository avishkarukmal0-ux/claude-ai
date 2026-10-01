// Supplier claims — recover credit for missing / damaged / wrong-priced goods, linked to the
// delivery that evidences them. Scoped to the active workspace. Nothing is ever sent to a
// supplier automatically; sharing is an explicit user action in the UI.
//
// Lifecycle: draft → submitted → acknowledged → approved | rejected → settled.
// Amounts are tracked separately and honestly: REQUESTED (what we asked for), APPROVED (what the
// supplier agreed), RECEIVED (credit actually banked).
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';
import { DELIVERY_ISSUES, deliveredUnits, acceptedUnits, orderedUnits, perUnitCost } from './deliveryStore';

const NAME = 'claims_v1';
export const CLAIM_STATUSES = ['draft', 'submitted', 'acknowledged', 'approved', 'rejected', 'settled'];
export const OPEN_CLAIM_STATUSES = ['draft', 'submitted', 'acknowledged', 'approved'];

function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function persist(list) { return writeJSON(NAME, list); }
function newId(p = 'cl') {
  try { if (crypto?.randomUUID) return `${p}_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Allowed forward transitions (keeps the lifecycle honest). */
export function nextStates(status) {
  switch (status) {
    case 'draft': return ['submitted'];
    case 'submitted': return ['acknowledged', 'approved', 'rejected'];
    case 'acknowledged': return ['approved', 'rejected'];
    case 'approved': return ['settled'];
    default: return []; // rejected / settled are terminal
  }
}

export function claimTotals(claim) {
  const requested = claim.requestedAmount != null
    ? Number(claim.requestedAmount) || 0
    : (claim.items || []).reduce((n, i) => n + (Number(i.amount) || 0), 0);
  return {
    requested: r2(requested),
    approved: claim.approvedAmount == null ? null : r2(claim.approvedAmount),
    received: claim.receivedAmount == null ? null : r2(claim.receivedAmount),
  };
}

/** Build claim items from a delivery's claimable issues (missing/damaged/wrong-price). */
export function claimItemsFromDelivery(delivery) {
  return (delivery.lines || [])
    .filter((l) => l.issue && DELIVERY_ISSUES[l.issue]?.claimable)
    .map((l) => {
      let affected;
      if (l.issue === 'damaged') affected = Math.max(0, deliveredUnits(l) - acceptedUnits(l)) || deliveredUnits(l);
      else if (l.issue === 'missing') affected = Math.max(0, orderedUnits(l) - deliveredUnits(l));
      else affected = acceptedUnits(l); // wrong_price
      const base = {
        id: newId('ci'), name: l.name, barcode: l.barcode || '', productId: l.productId || null,
        qty: affected, reason: l.issue, photo: l.photo || null,
      };
      // Missing/damaged: you're owed the full value of those units. Wrong-price: you're only owed the
      // OVERCHARGE (billed − agreed) per unit, so start at £0 with the billed price captured and prompt
      // the owner to enter the agreed price in the claim (audit W8).
      if (l.issue === 'wrong_price') {
        return { ...base, unitBilled: r2(perUnitCost(l)), unitAgreed: null, amount: 0 };
      }
      return { ...base, amount: r2(affected * perUnitCost(l)) };
    });
}

export function useClaims() {
  const [claims, setClaims] = useState(load);

  useEffect(() => {
    const refresh = () => setClaims(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('vendora:workspace', refresh);
    };
  }, []);

  const persistAll = (next) => { persist(next); setClaims(next); };

  const createFromDelivery = useCallback((delivery) => {
    const items = claimItemsFromDelivery(delivery);
    if (items.length === 0) return null;
    const claim = {
      id: newId(), status: 'draft',
      supplierId: delivery.supplierId || null, supplierName: delivery.supplierName || '',
      deliveryId: delivery.id, deliveryRef: delivery.reference || '',
      items, requestedAmount: r2(items.reduce((n, i) => n + (Number(i.amount) || 0), 0)),
      approvedAmount: null, receivedAmount: null, creditNoteRef: '', followUpDate: '', note: '',
      createdAt: Date.now(), updatedAt: Date.now(), history: [{ status: 'draft', at: Date.now() }],
    };
    persistAll([claim, ...load()]);
    return claim;
  }, []);

  /** Create a claim from pre-built items (e.g. reconciliation discrepancies) — same lifecycle/shape as
   *  createFromDelivery so the existing claims workflow handles it. Items may omit id (assigned here). */
  const createClaim = useCallback(({ supplierId = null, supplierName = '', deliveryId = null, deliveryRef = '', items = [] } = {}) => {
    const withIds = items.map((it) => ({ id: newId('ci'), photo: null, ...it }));
    if (!withIds.length) return null;
    const claim = {
      id: newId(), status: 'draft',
      supplierId: supplierId || null, supplierName: supplierName || '',
      deliveryId: deliveryId || null, deliveryRef: deliveryRef || '',
      items: withIds, requestedAmount: r2(withIds.reduce((n, i) => n + (Number(i.amount) || 0), 0)),
      approvedAmount: null, receivedAmount: null, creditNoteRef: '', followUpDate: '', note: '',
      createdAt: Date.now(), updatedAt: Date.now(), history: [{ status: 'draft', at: Date.now() }],
    };
    persistAll([claim, ...load()]);
    return claim;
  }, []);

  const updateClaim = useCallback((id, patch) => {
    persistAll(load().map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)));
  }, []);

  /** Edit one claim item (e.g. enter the agreed price on a wrong-price line). For wrong_price we recompute
   *  the claimed amount as the OVERCHARGE: max(0, billed − agreed) × qty (audit W8). */
  const updateClaimItem = useCallback((claimId, itemId, patch) => {
    persistAll(load().map((c) => {
      if (c.id !== claimId) return c;
      const items = (c.items || []).map((it) => {
        if (it.id !== itemId) return it;
        const merged = { ...it, ...patch };
        if (merged.reason === 'wrong_price') {
          const billed = Number(merged.unitBilled);
          const agreed = Number(merged.unitAgreed);
          merged.amount = (Number.isFinite(billed) && Number.isFinite(agreed))
            ? r2(Math.max(0, billed - agreed) * (Number(merged.qty) || 0)) : 0;
        }
        return merged;
      });
      return { ...c, items, updatedAt: Date.now() };
    }));
  }, []);

  /** Advance the lifecycle, enforcing allowed transitions. */
  const advance = useCallback((id, to) => {
    persistAll(load().map((c) => {
      if (c.id !== id) return c;
      if (!nextStates(c.status).includes(to)) return c; // ignore illegal jumps
      const patch = { status: to, updatedAt: Date.now(), history: [...(c.history || []), { status: to, at: Date.now() }] };
      // 'approved' may default to the requested amount (the supplier agreeing a figure is a reasonable
      // default the owner can edit). 'settled' must NOT auto-set receivedAmount: money is only "received"
      // when the owner confirms the actual credit (Phase 0 / credit-note matching). Treating settled as
      // paid is exactly what we must not do — leave receivedAmount for explicit confirmation.
      if (to === 'approved' && c.approvedAmount == null) patch.approvedAmount = claimTotals(c).requested;
      return { ...c, ...patch };
    }));
  }, []);

  const removeClaim = useCallback((id) => { persistAll(load().filter((c) => c.id !== id)); }, []);

  return { claims, createFromDelivery, createClaim, updateClaim, updateClaimItem, advance, removeClaim };
}
