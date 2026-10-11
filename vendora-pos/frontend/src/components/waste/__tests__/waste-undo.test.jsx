import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import WasteView from '../WasteView';
import { recordRecovery } from '../../../lib/recoveryGuard';
import * as storageNs from '../../../lib/storage';

const { writeJSON, setActiveWorkspace, __resetMemForTest } = storageNs;

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace('shop:r8');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Audit R8 (round 3): undoEntry discarded the reverse result and ALWAYS removed the waste entry — so a failed
// stock-restore made the entry vanish while stock stayed reduced. The entry must be KEPT so the owner can retry.
describe('WasteView — undo keeps the entry when the stock restore fails (R8)', () => {
  it('a failed reverse leaves the waste entry in place (not silently dropped)', () => {
    // A product (stock already reduced by an earlier bin) + a product-linked waste entry to undo.
    writeJSON('inventory_v1', [{ id: 'p1', name: 'Milk 2L', qty: 4, cost: 1, price: 2 }]);
    writeJSON('waste_v1', [{
      id: 'w1', type: 'wasted', name: 'Milk 2L', value: 2, qty: 2,
      productId: 'p1', batchId: 'op1', productBatchId: null, ts: Date.now(),
    }]);

    const { getAllByLabelText, container } = render(<WasteView onBack={() => {}} />);
    expect(getAllByLabelText('Undo — restores stock')).toHaveLength(1);

    // Make the reverse's stock-restore write fail, then click Undo.
    const orig = storageNs.writeJSON;
    const spy = vi.spyOn(storageNs, 'writeJSON').mockImplementation((name, value, ws) => (name === 'inventory_v1' ? { ok: false, error: 'quota' } : orig(name, value, ws)));
    fireEvent.click(getAllByLabelText('Undo — restores stock')[0]);
    spy.mockRestore();

    // The entry is still there (round 2 would have removed it despite the failed restore).
    expect(getAllByLabelText('Undo — restores stock')).toHaveLength(1);
    expect(container.textContent).toContain('Milk 2L');
  });

  // Audit V1 (round 4): after an UNSAFE undo (stock restored, ledger + rollback both failed), the durable flag
  // is set and the entry remains. A second Undo must NOT reverse again (it would double-restore 10→12).
  it('V1: a second Undo is blocked once the item is flagged unsafe (no double restore)', () => {
    writeJSON('inventory_v1', [{ id: 'p1', name: 'Milk 2L', qty: 10, cost: 1, price: 2 }]);
    writeJSON('waste_v1', [{
      id: 'w1', type: 'wasted', name: 'Milk 2L', value: 2, qty: 2,
      productId: 'p1', batchId: 'op1', productBatchId: null, ts: Date.now(),
    }]);
    recordRecovery('product:p1', { kind: 'waste', name: 'Milk 2L' }); // the prior unsafe undo left this flag

    const { getAllByLabelText } = render(<WasteView onBack={() => {}} />);
    const before = storageNs.readJSON('inventory_v1', []).find((p) => p.id === 'p1').qty;
    fireEvent.click(getAllByLabelText('Undo — restores stock')[0]);
    const after = storageNs.readJSON('inventory_v1', []).find((p) => p.id === 'p1').qty;

    expect(after).toBe(before);  // stock unchanged — the reverse was blocked (pre-fix it would restore again)
    expect(getAllByLabelText('Undo — restores stock')).toHaveLength(1); // entry retained for reconciliation
  });
});
