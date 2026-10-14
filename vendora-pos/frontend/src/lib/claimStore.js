// Supplier claims — recover credit for missing / damaged / wrong-priced goods, linked to the
// delivery that evidences them. Scoped to the active workspace. Nothing is ever sent to a
// supplier automatically; sharing is an explicit user action in the UI.
//
// Lifecycle: draft → submitted → acknowledged → approved | rejected → settled.
// Amounts are tracked separately and honestly: REQUESTED (what we asked for), APPROVED (what the
// supplier agreed), RECEIVED (credit actually banked).
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';
import { DELIVERY_ISSUES, deliveredUnits, acceptedUnits, orderedUnits, perUnitCost, lineIssues } from './deliveryStore';
import { actorName } from './actor';
import { round2 as r2, sumMoney, mul } from './money';

const NAME = 'claims_v1';
export const CLAIM_STATUSES = ['draft', 'submitted', 'acknowledged', 'approved', 'rejected', 'settled'];
export const OPEN_CLAIM_STATUSES = ['draft', 'submitted', 'acknowledged', 'approved'];

function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function persist(list) { return writeJSON(NAME, list); }
function newId(p = 'cl') {
  try { if (crypto?.randomUUID) return `${p}_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

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
    : sumMoney((claim.items || []).map((i) => i.amount));
  return {
    requested: r2(requested),
    approved: claim.approvedAmount == null ? null : r2(claim.approvedAmount),
    received: claim.receivedAmount == null ? null : r2(claim.receivedAmount),
  };
}

/** Build claim items from a delivery's claimable issues (missing/damaged/wrong-price). */
export function claimItemsFromDelivery(delivery) {
  // One line can now carry several issues (Damaged + Wrong price); build a claim item per claimable issue.
  return (delivery.lines || []).flatMap((l) => {
    const delivered = deliveredUnits(l);
    return lineIssues(l)
      .filter((iss) => DELIVERY_ISSUES[iss.type]?.claimable)
      .map((iss) => {
        // Affected quantity drives the claim VALUE (affected × unit cost). The owner sets it per issue in the
        // delivery form (iss.qty); when present we use it (clamped to what was delivered). Otherwise a default.
        const explicit = Number(iss.qty);
        const hasExplicit = Number.isFinite(explicit) && explicit > 0;
        let affected;
        if (iss.type === 'missing') {
          affected = hasExplicit ? explicit : Math.max(0, orderedUnits(l) - delivered);
        } else if (iss.type === 'damaged') {
          affected = hasExplicit ? Math.min(explicit, delivered) : (Math.max(0, delivered - acceptedUnits(l)) || 1);
        } else { // wrong_price — default to ALL delivered units (3 units billed wrong = claim ×3, not ×1).
          affected = hasExplicit ? Math.min(explicit, delivered || explicit) : (delivered || 1);
        }
        const base = {
          id: newId('ci'), name: l.name, barcode: l.barcode || '', productId: l.productId || null,
          qty: affected, reason: iss.type, photo: l.photo || null,
        };
        // Missing/damaged: owed the full value of those units. Wrong-price: owed only the OVERCHARGE
        // (billed − agreed) per unit. Default the agreed price to the PREVIOUS cost (`priorUnitCost`, captured
        // on the delivery line from the product's cost at book-in) so the claim values itself straight away;
        // when it's unknown, fall back to £0 and prompt the owner to enter the agreed price (audit W8).
        if (iss.type === 'wrong_price') {
          const billed = r2(perUnitCost(l));
          // Only treat a GENUINE prior cost as the agreed price — `null`/'' means "unknown" (Number(null) is 0,
          // which would wrongly claim the whole billed amount), so leave agreed null and prompt the owner.
          const priorN = Number(l.priorUnitCost);
          const hasPrior = l.priorUnitCost != null && l.priorUnitCost !== '' && Number.isFinite(priorN) && priorN >= 0;
          const agreed = hasPrior ? r2(priorN) : null;
          const amount = agreed != null ? mul(Math.max(0, billed - agreed), affected) : 0;
          return { ...base, unitBilled: billed, unitAgreed: agreed, amount };
        }
        return { ...base, amount: mul(perUnitCost(l), affected) };
      });
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

  // Audit D4 (round 2): only update React state when the write actually COMMITTED — otherwise the UI showed the
  // uncommitted value while storage kept the old one (they diverge until reload). Return the write result.
  const persistAll = (next) => { const res = persist(next); if (res && res.ok) setClaims(next); return res; };

  const createFromDelivery = useCallback((delivery) => {
    const items = claimItemsFromDelivery(delivery);
    if (items.length === 0) return null;
    const claim = {
      id: newId(), status: 'draft',
      supplierId: delivery.supplierId || null, supplierName: delivery.supplierName || '',
      deliveryId: delivery.id, deliveryRef: delivery.reference || '',
      items, requestedAmount: sumMoney(items.map((i) => i.amount)),
      approvedAmount: null, receivedAmount: null, creditNoteRef: '', followUpDate: '', note: '',
      raisedBy: actorName(),
      createdAt: Date.now(), updatedAt: Date.now(), history: [{ status: 'draft', at: Date.now() }],
    };
    persistAll([claim, ...load()]);
    return claim;
  }, []);

  /** Create a claim from pre-built items (e.g. reconciliation discrepancies) — same lifecycle/shape as
   *  createFromDelivery so the existing claims workflow handles it. Items may omit id (assigned here).
   *  Carries the source invoice reference (acceptance A1) alongside the delivery reference. */
  const createClaim = useCallback(({ supplierId = null, supplierName = '', deliveryId = null, deliveryRef = '', invoiceId = null, invoiceRef = '', items = [] } = {}) => {
    const withIds = items.map((it) => ({ id: newId('ci'), photo: null, ...it }));
    if (!withIds.length) return null;
    const claim = {
      id: newId(), status: 'draft',
      supplierId: supplierId || null, supplierName: supplierName || '',
      deliveryId: deliveryId || null, deliveryRef: deliveryRef || '',
      invoiceId: invoiceId || null, invoiceRef: invoiceRef || '',
      items: withIds, requestedAmount: sumMoney(withIds.map((i) => i.amount)),
      approvedAmount: null, receivedAmount: null, creditNoteRef: '', followUpDate: '', note: '',
      raisedBy: actorName(),
      createdAt: Date.now(), updatedAt: Date.now(), history: [{ status: 'draft', at: Date.now() }],
    };
    persistAll([claim, ...load()]);
    return claim;
  }, []);

  const updateClaim = useCallback((id, patch) => {
    persistAll(load().map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)));
  }, []);

  /** Allocate a supplier credit note to a claim (Phase 2). Received money is the sum of applied credits —
   *  an auditable list, idempotent per credit note (re-applying the same note replaces its entry, never
   *  double-counts). Returns the updated claim or null. */
  const applyCredit = useCallback((claimId, { creditNoteId, creditNoteRef = '', amount }) => {
    const amt = r2(amount);
    if (!creditNoteId || !(amt > 0)) return null;
    let updated = null;
    const res = persistAll(load().map((c) => {
      if (c.id !== claimId) return c;
      const credits = (c.credits || []).filter((x) => x.creditNoteId !== creditNoteId); // replace, don't duplicate
      credits.push({ id: newId('cr'), creditNoteId, creditNoteRef, amount: amt, at: Date.now() });
      const received = sumMoney(credits.map((x) => x.amount));
      updated = {
        ...c, credits, receivedAmount: received, creditNoteRef: creditNoteRef || c.creditNoteRef || '',
        updatedAt: Date.now(),
        history: [...(c.history || []), { status: c.status, at: Date.now(), event: 'credit', creditNoteId, amount: amt }],
      };
      return updated;
    }));
    // Audit D4: if the claim write didn't commit, return null so the caller rolls the credit-note allocation back
    // (the two ledgers must not diverge — note shows credited while the claim never recorded it).
    return (res && res.ok) ? updated : null;
  }, []);

  /** Remove a credit note's allocation from a claim (correction). Recomputes received from remaining credits.
   *  Audit D4 (round 2): RETURN the write result so the caller doesn't clear the note side when the claim write
   *  failed (the two ledgers must not diverge). */
  const removeCredit = useCallback((claimId, creditNoteId) => {
    const res = persistAll(load().map((c) => {
      if (c.id !== claimId) return c;
      const credits = (c.credits || []).filter((x) => x.creditNoteId !== creditNoteId);
      const received = credits.length ? sumMoney(credits.map((x) => x.amount)) : null;
      return { ...c, credits, receivedAmount: received, updatedAt: Date.now(), history: [...(c.history || []), { status: c.status, at: Date.now(), event: 'credit-removed', creditNoteId }] };
    }));
    return (res && res.ok) ? { ok: true } : { ok: false, error: (res && res.error) || 'Couldn’t update the claim' };
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
          // A blank agreed price is UNKNOWN, not £0 — Number(null)/Number('') is 0, which would wrongly claim
          // the whole billed value. Only compute the overcharge once a real agreed price is entered.
          const hasAgreed = merged.unitAgreed != null && merged.unitAgreed !== '';
          const agreed = Number(merged.unitAgreed);
          merged.amount = (hasAgreed && Number.isFinite(billed) && Number.isFinite(agreed))
            ? mul(Math.max(0, billed - agreed), merged.qty) : 0;
        }
        return merged;
      });
      // Keep the requested total in step with the items while the claim is still an editable DRAFT. Previously
      // this guarded on `c.status === 'requested'` — a status that does NOT exist (lifecycle is draft → submitted
      // → …) — so a new wrong-price claim ('draft') never had its edited line amount reach the requested/approved
      // total (it stayed £0) (audit D1). Once submitted/agreed the figure is authoritative and left untouched.
      const next = { ...c, items, updatedAt: Date.now() };
      if (!c.status || c.status === 'draft') next.requestedAmount = sumMoney(items.map((i) => i.amount));
      return next;
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

  // Undo for a removal — re-insert the exact claim (id preserved), no-op if it's already back.
  const restoreClaim = useCallback((claim) => {
    if (!claim || !claim.id) return;
    const cur = load();
    if (cur.some((c) => c.id === claim.id)) return;
    persistAll([claim, ...cur]);
  }, []);

  return { claims, createFromDelivery, createClaim, updateClaim, updateClaimItem, applyCredit, removeCredit, advance, removeClaim, restoreClaim };
}
