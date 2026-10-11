import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import DeliveryReceivingView from '../DeliveryReceivingView';
import * as storageNs from '../../../lib/storage';

const { writeJSON, readJSON, setActiveWorkspace, __resetMemForTest } = storageNs;

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace('shop:r10');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function seedDraft() {
  writeJSON('inventory_v1', [{ id: 'pX', name: 'Water', barcode: '900', qty: 10, cost: 0.3, price: 1 }]);
  writeJSON('deliveries_v1', [{
    id: 'dlR10', status: 'draft', supplierName: 'Bookerz', reference: 'R10', note: '', photos: [], orderId: null,
    lines: [{ key: 'ln1', barcode: '900', productId: 'pX', name: 'Water', packSize: 1, qtyMode: 'units', orderedQty: '', deliveredQty: 5, acceptedQty: '', unitCost: '0.3', caseCost: '', issue: null, note: '', photo: null }],
    createdAt: Date.now(), updatedAt: Date.now(), receivedAt: null,
  }]);
}
const qtyOf = (id) => readJSON('inventory_v1', []).find((p) => p.id === id).qty;
const statusOf = (id) => readJSON('deliveries_v1', []).find((d) => d.id === id).status;

// Audit R10 (round 3): stock committed but the document write failed → the delivery stayed a draft and a retry
// hit applyDelivery's duplicate guard, so the workflow could never finish. The receive flow must finish the
// document from the committed operation WITHOUT re-applying stock.
describe('DeliveryReceivingView — finish a committed delivery whose document write failed (R10)', () => {
  it('a failed markReceived keeps stock in + draft open; a retry finishes without double-applying', () => {
    seedDraft();
    const { getByText, getByRole } = render(<DeliveryReceivingView />);
    fireEvent.click(getByText(/Bookerz/)); // open the draft editor

    // First Receive: the DOCUMENT write (deliveries_v1) fails; stock (inventory_v1 + movements_v1) still commits.
    const orig = storageNs.writeJSON;
    const spy = vi.spyOn(storageNs, 'writeJSON').mockImplementation((name, value, ws) => (name === 'deliveries_v1' ? { ok: false, error: 'quota' } : orig(name, value, ws)));
    fireEvent.click(getByRole('button', { name: /Receive/ }));
    spy.mockRestore();

    expect(qtyOf('pX')).toBe(15);           // stock applied (10 + 5)
    expect(statusOf('dlR10')).toBe('draft'); // document not finished — but NOT stuck

    // Retry: stock is already committed (operation guard), so this only finishes the document — no double stock.
    fireEvent.click(getByRole('button', { name: /Receive/ }));
    expect(qtyOf('pX')).toBe(15);            // NOT 20 — stock was not re-applied
    expect(statusOf('dlR10')).toBe('received'); // workflow completes
  });
});
