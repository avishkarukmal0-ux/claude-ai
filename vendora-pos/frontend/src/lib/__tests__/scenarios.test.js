import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as storage from '../storage';
import * as sync from '../sync';
import { useInvoices } from '../invoiceStore';
import { useClaims } from '../claimStore';
import { useCreditNotes, claimOutstanding } from '../creditNoteStore';
import { reconcile, discrepanciesToClaimItems } from '../reconcile';
import { recordMovement, hasOperation, MOVEMENT_TYPES } from '../movementStore';
import { parseInvoiceText } from '../parseInvoiceText';
import { canSeeScreen } from '../permissions';

// Acceptance Phase 3 — the eight required end-to-end scenarios, validated at the store/engine level.
const dl = (o) => ({ id: 'd', productId: null, barcode: '', name: '', orderedQty: 0, deliveredQty: 0, packSize: 1, qtyMode: 'units', unitCost: 0, caseCost: 0, ...o });
const il = (o) => ({ id: 'i', productId: null, barcode: '', name: '', qty: 0, packSize: 1, qtyMode: 'units', unitCost: 0, caseCost: 0, ...o });

let wsN = 0;
beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } storage.__resetMemForTest?.(); storage.setActiveWorkspace(`shop:sc${wsN++}`); });

describe('Scenario 1 — correct invoice + complete delivery', () => {
  it('produces no claimable discrepancies', () => {
    const delivery = { id: 'del1', lines: [dl({ id: 'dl1', barcode: '1', name: 'Cola', deliveredQty: 24, unitCost: 1 })] };
    const invoice = { id: 'inv1', reference: 'INV-1', lines: [il({ id: 'il1', barcode: '1', name: 'Cola', qty: 24, unitCost: 1 })] };
    const { summary } = reconcile({ delivery, invoice });
    expect(summary.claimable).toBe(0);
    expect(summary.overcharge).toBe(0);
  });
});

describe('Scenario 2 — shortage then a partial supplier credit', () => {
  it('claims the shortage, treats approval and receipt as distinct, and tracks partial credit', () => {
    const delivery = { id: 'del2', lines: [dl({ id: 'dl2', barcode: '1', name: 'Cola', deliveredQty: 10, unitCost: 1 })] };
    const invoice = { id: 'inv2', reference: 'INV-2', lines: [il({ id: 'il2', barcode: '1', name: 'Cola', qty: 20, unitCost: 1 })] };
    const { discrepancies } = reconcile({ delivery, invoice });
    const items = discrepanciesToClaimItems(discrepancies);
    expect(items.find((i) => i.reason === 'missing').amount).toBe(10); // 10 short × £1

    const { result } = renderHook(() => useClaims());
    let claim;
    act(() => { claim = result.current.createClaim({ supplierName: 'Bestway', deliveryId: 'del2', invoiceId: 'inv2', invoiceRef: 'INV-2', items }); });
    expect(claim.requestedAmount).toBe(10);
    expect(claim.invoiceId).toBe('inv2');

    act(() => { result.current.advance(claim.id, 'submitted'); });
    act(() => { result.current.advance(claim.id, 'approved'); });
    let approved = result.current.claims[0];
    expect(approved.approvedAmount).toBe(10); // supplier agreed
    expect(approved.receivedAmount).toBeNull(); // but money NOT received yet (approval ≠ receipt)

    act(() => { result.current.applyCredit(claim.id, { creditNoteId: 'cn2', creditNoteRef: 'CN-2', amount: 6 }); });
    const credited = result.current.claims[0];
    expect(credited.receivedAmount).toBe(6);      // only now is money recorded, via a confirmed credit
    expect(claimOutstanding(credited)).toBe(4);   // 10 approved − 6 received
  });
});

describe('Scenario 3 — incorrect price with a case/unit conversion', () => {
  it('computes the overcharge on normalised single units', () => {
    const delivery = { id: 'del3', lines: [dl({ id: 'dl3', barcode: '1', name: 'Cola', deliveredQty: 24, unitCost: 1 })] }; // 24 units @ £1
    const invoice = { id: 'inv3', reference: 'INV-3', lines: [il({ id: 'il3', barcode: '1', name: 'Cola', qty: 1, qtyMode: 'cases', packSize: 24, caseCost: 28.80 })] }; // £1.20/unit
    const { discrepancies } = reconcile({ delivery, invoice });
    const over = discrepancies.find((d) => d.type === 'overcharge');
    expect(over.units).toBe(24);
    expect(over.overcharge).toBe(4.8); // (1.20 − 1.00) × 24
    expect(over.unitBilled).toBe(1.2);
    expect(over.unitAgreed).toBe(1);
  });
});

describe('Scenario 4 — duplicate invoice or credit-note upload', () => {
  it('detects a duplicate invoice and a duplicate credit note', () => {
    const inv = renderHook(() => useInvoices());
    act(() => { inv.result.current.saveDraft({ supplierName: 'Booker', reference: 'INV-9', date: '2026-10-01', lines: [{ name: 'A', qty: 1, unitCost: 5 }] }); });
    const dupInvoice = inv.result.current.findDuplicate({ id: 'other', supplierName: 'Booker', reference: 'INV-9', date: '2026-10-01', lines: [{ name: 'A', qty: 1, unitCost: 5 }] });
    expect(dupInvoice).toBeTruthy();

    const cn = renderHook(() => useCreditNotes());
    act(() => { cn.result.current.saveNote({ supplierName: 'Booker', reference: 'CN-9', date: '2026-10-01', amount: 5 }); });
    const dupNote = cn.result.current.findDuplicate({ id: 'other', supplierName: 'Booker', reference: 'CN-9', date: '2026-10-01', amount: 5 });
    expect(dupNote).toBeTruthy();
  });
});

describe('Scenario 5 — interrupted save then retry', () => {
  it('a retry with the same id does not create a second record', () => {
    const { result } = renderHook(() => useInvoices());
    let first; let second;
    act(() => { first = result.current.saveDraft({ id: 'inv_fixed', supplierName: 'Booker', reference: 'R-1', lines: [{ name: 'A', qty: 1, unitCost: 1 }] }); });
    act(() => { second = result.current.saveDraft({ id: 'inv_fixed', supplierName: 'Booker', reference: 'R-1', lines: [{ name: 'A', qty: 1, unitCost: 1 }] }); }); // retry
    expect(first.ok && second.ok).toBe(true);
    expect(result.current.invoices.filter((x) => x.id === 'inv_fixed').length).toBe(1); // no duplicate
  });

  it('a retried stock operation is idempotent via the operationId guard', () => {
    const op = 'op_del_123';
    expect(hasOperation(op)).toBe(false);
    act(() => { recordMovement({ productId: 'p1', type: MOVEMENT_TYPES.GOODS_RECEIVED, delta: 24, operationId: op }); });
    // Retry: a well-behaved caller checks hasOperation first and skips.
    if (!hasOperation(op)) act(() => { recordMovement({ productId: 'p1', type: MOVEMENT_TYPES.GOODS_RECEIVED, delta: 24, operationId: op }); });
    const movements = storage.readJSON('movements_v1', []);
    expect(movements.filter((m) => m.operationId === op).length).toBe(1); // written once
  });
});

describe('Scenario 7 — staff attempting an owner-only action', () => {
  it('staff cannot see money/claim screens; the owner can (server enforces too)', () => {
    expect(canSeeScreen('staff', 'claims')).toBe(false);
    expect(canSeeScreen('staff', 'invoices')).toBe(false);
    expect(canSeeScreen('staff', 'staff-admin')).toBe(false);
    expect(canSeeScreen('owner', 'claims')).toBe(true);
    // Backend enforcement is covered by pwaAuth.integration (staff admin 403) + pwaSync.integration
    // (staff financial-store push rejected) + pwaIsolation.integration (cross-tenant 404).
  });
});

describe('Scenario 8 — unclear invoice requiring manual correction', () => {
  it('heuristic pre-fill flags lines uncertain; nothing is trusted until an explicit commit', () => {
    const text = 'SU6AR 1KG   2x   2.40\nteabags 240   3.99\ntotal due 6.39';
    const { lines } = parseInvoiceText(text);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.every((l) => l.uncertain)).toBe(true); // owner must check each

    const { result } = renderHook(() => useInvoices());
    let saved;
    // Owner corrects a mis-OCR'd name and saves a draft.
    const corrected = lines.map((l) => ({ ...l, name: l.name.replace(/SU6AR/i, 'Sugar') }));
    act(() => { saved = result.current.saveDraft({ supplierName: 'Bestway', reference: 'INV-8', lines: corrected }); });
    expect(saved.invoice.status).toBe('draft'); // not trusted yet
    act(() => { result.current.commitInvoice(saved.invoice.id); });
    expect(result.current.invoices[0].status).toBe('committed'); // trusted only after explicit commit
  });
});

// Scenario 6 — conflicting edits from two devices → last-write-wins by mtime (through the real sync engine).
function fakeServer() {
  const blobs = new Map();
  return {
    blobs,
    transport: async (path, { method = 'GET', body } = {}) => {
      if (path === '/pull') return { success: true, blobs: [...blobs.entries()].map(([name, b]) => ({ name, ...b })) };
      if (path === '/push') {
        const applied = []; const conflicts = [];
        for (const c of (body && body.changes) || []) {
          const ex = blobs.get(c.name);
          if (!ex) { blobs.set(c.name, { value: c.value, rev: 1, mtime: c.mtime }); applied.push({ name: c.name, rev: 1 }); }
          else if (ex.rev === c.baseRev || c.mtime > ex.mtime) { const rev = ex.rev + 1; blobs.set(c.name, { value: c.value, rev, mtime: c.mtime }); applied.push({ name: c.name, rev }); }
          else conflicts.push({ name: c.name, value: ex.value, rev: ex.rev, mtime: ex.mtime });
        }
        return { success: true, applied, conflicts, rejected: [] };
      }
      throw new Error(`unexpected ${path}`);
    },
  };
}

describe('Scenario 6 — conflicting edits from two devices', () => {
  let srv;
  beforeEach(() => {
    storage.__setDurableBackend?.({ available: () => false });
    sync.__resetSyncForTest();
    const ws = storage.getActiveWorkspace();
    localStorage.setItem('vendora:auth', JSON.stringify({ token: 't', refreshToken: 'r', shop: { id: ws.slice(5), name: 'S' } }));
    srv = fakeServer();
    sync.__setSyncTransport(srv.transport);
  });
  afterEach(() => { sync.__setSyncTransport(null); storage.__setDurableBackend?.(null); sync.__resetSyncForTest(); });

  it('the newer edit wins; the stale device adopts the server copy', async () => {
    const ws = storage.getActiveWorkspace();
    // Device B already pushed a NEWER value to the cloud.
    srv.blobs.set('buylist_v1', { value: JSON.stringify([{ id: 'from-B', mtime: 9000 }]), rev: 5, mtime: 9000 });
    // This (stale) device has an OLDER local edit it tries to push.
    storage.writeJSON('buylist_v1', [{ id: 'from-A-old' }], ws);
    sync.markStoreDirty('buylist_v1', 1000); // older mtime

    const res = await sync.syncNow();
    expect(res.ok).toBe(true);
    // Last-write-wins by mtime → device B's newer value is adopted locally.
    expect(storage.readJSON('buylist_v1', null, ws)).toEqual([{ id: 'from-B', mtime: 9000 }]);
  });
});
