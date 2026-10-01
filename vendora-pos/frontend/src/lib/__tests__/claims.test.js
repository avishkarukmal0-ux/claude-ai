import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClaims, claimTotals, nextStates, claimItemsFromDelivery } from '../claimStore';
import { blankLine } from '../deliveryStore';
import { setActiveWorkspace } from '../storage';

let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:cl${ws++}`); });

function deliveryWithIssues() {
  return {
    id: 'd1', status: 'received', supplierName: 'Booker', reference: 'INV9',
    lines: [
      blankLine({ name: 'Cola', barcode: '111', qtyMode: 'cases', packSize: 24, deliveredQty: 3, acceptedQty: 2, caseCost: 12, issue: 'damaged' }), // 1 case damaged = 24 units @0.5
      blankLine({ name: 'Beans', barcode: '222', qtyMode: 'units', orderedQty: 10, deliveredQty: 7, unitCost: 0.4, issue: 'missing' }), // 3 missing @0.4
      blankLine({ name: 'Milk', barcode: '333', qtyMode: 'units', deliveredQty: 5, unitCost: 1, issue: null }), // no issue → excluded
    ],
  };
}

describe('claims — build from delivery issues with evidence', () => {
  it('creates claim items only for claimable issues with sensible amounts', () => {
    const items = claimItemsFromDelivery(deliveryWithIssues());
    expect(items.length).toBe(2); // damaged + missing, not the clean line
    const damaged = items.find((i) => i.reason === 'damaged');
    expect(damaged.qty).toBe(24);       // 1 case × 24 not accepted
    expect(damaged.amount).toBeCloseTo(12); // 24 × 0.5
    const missing = items.find((i) => i.reason === 'missing');
    expect(missing.qty).toBe(3);        // 10 ordered − 7 delivered
    expect(missing.amount).toBeCloseTo(1.2); // 3 × 0.4
  });
});

describe('claims — lifecycle & honest amounts', () => {
  it('advances draft→submitted→approved→settled with requested/approved/received distinct', () => {
    const { result } = renderHook(() => useClaims());
    let id;
    act(() => { id = result.current.createFromDelivery(deliveryWithIssues()).id; });
    let c = result.current.claims.find((x) => x.id === id);
    expect(c.status).toBe('draft');
    expect(claimTotals(c).requested).toBeCloseTo(13.2); // 12 + 1.2
    expect(claimTotals(c).approved).toBeNull();
    expect(claimTotals(c).received).toBeNull();

    act(() => { result.current.advance(id, 'submitted'); });
    act(() => { result.current.advance(id, 'approved'); });
    c = result.current.claims.find((x) => x.id === id);
    expect(c.status).toBe('approved');
    expect(claimTotals(c).approved).toBeCloseTo(13.2); // defaulted to requested on approval

    act(() => { result.current.updateClaim(id, { approvedAmount: 10, receivedAmount: null }); });
    act(() => { result.current.advance(id, 'settled'); });
    c = result.current.claims.find((x) => x.id === id);
    expect(c.status).toBe('settled');
    // Phase 0: settling does NOT assume the credit was received — stays null until explicitly confirmed.
    expect(claimTotals(c).received).toBeNull();
    act(() => { result.current.updateClaim(id, { receivedAmount: 9.5 }); }); // owner confirms actual credit
    c = result.current.claims.find((x) => x.id === id);
    expect(claimTotals(c).received).toBeCloseTo(9.5);
  });

  it('ignores illegal transitions', () => {
    const { result } = renderHook(() => useClaims());
    let id;
    act(() => { id = result.current.createFromDelivery(deliveryWithIssues()).id; });
    act(() => { result.current.advance(id, 'settled'); }); // draft can't jump to settled
    expect(result.current.claims.find((x) => x.id === id).status).toBe('draft');
    expect(nextStates('draft')).toEqual(['submitted']);
    expect(nextStates('settled')).toEqual([]);
  });
});

describe('claims — wrong-price claims the overcharge (audit W8)', () => {
  it('a wrong_price item starts at £0 with the billed price captured, then claims (billed − agreed) × qty', () => {
    const delivery = {
      id: 'd1', status: 'received', supplierName: 'Booker', reference: 'INV1',
      lines: [{ ...blankLine(), name: 'Cola', qty: 10, unitCost: 2, issue: 'wrong_price', qtyMode: 'units', receivedQty: 10 }],
    };
    const items = claimItemsFromDelivery(delivery);
    expect(items[0]).toMatchObject({ reason: 'wrong_price', unitBilled: 2, unitAgreed: null, amount: 0 });

    const { result } = renderHook(() => useClaims());
    let claim;
    act(() => { claim = result.current.createFromDelivery(delivery); });
    const item = result.current.claims[0].items[0];
    act(() => { result.current.updateClaimItem(claim.id, item.id, { unitAgreed: 1.8 }); });
    const updated = result.current.claims[0].items[0];
    // Claims the OVERCHARGE (billed − agreed) × qty, NOT the full value (billed × qty).
    expect(updated.amount).toBeCloseTo((2 - 1.8) * updated.qty, 2);
    expect(updated.amount).toBeLessThan(2 * updated.qty);
  });
});
