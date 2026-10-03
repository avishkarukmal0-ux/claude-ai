import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOrders, orderTotals, statusFor, incomingByProduct, incomingFor } from '../orderStore';
import { setActiveWorkspace } from '../storage';

let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:or${ws++}`); });

const line = (o) => ({ productId: 'p1', barcode: '111', name: 'Cola', qty: 24, unitCost: 0.5, ...o });

describe('orderStore — totals & status transitions', () => {
  it('an ordered order becomes partially, then fully received', () => {
    const { result } = renderHook(() => useOrders());
    let id;
    act(() => { id = result.current.createOrder({ supplierName: 'Booker', lines: [line({ qty: 10 })] }).id; });
    expect(statusFor(result.current.orders.find((o) => o.id === id))).toBe('ordered');

    act(() => { result.current.receiveAgainst(id, [{ productId: 'p1', qty: 4 }]); });
    let o = result.current.orders.find((x) => x.id === id);
    expect(statusFor(o)).toBe('partially_received');
    expect(orderTotals(o).remaining).toBe(6);

    act(() => { result.current.receiveAgainst(id, [{ productId: 'p1', qty: 6 }]); });
    o = result.current.orders.find((x) => x.id === id);
    expect(statusFor(o)).toBe('received');
    expect(orderTotals(o).remaining).toBe(0);
    expect(o.receivedAt).toBeTruthy();
  });

  it('cancel and markReceived work', () => {
    const { result } = renderHook(() => useOrders());
    let a; let b;
    act(() => { a = result.current.createOrder({ supplierName: 'A', lines: [line()] }).id; });
    act(() => { b = result.current.createOrder({ supplierName: 'B', lines: [line()] }).id; });
    act(() => { result.current.cancelOrder(a); });
    act(() => { result.current.markReceived(b); });
    expect(statusFor(result.current.orders.find((o) => o.id === a))).toBe('cancelled');
    expect(statusFor(result.current.orders.find((o) => o.id === b))).toBe('received');
  });
});

describe('orderStore — record vs send (Phase 2)', () => {
  it('a draft order is recorded but NOT sent (orderedAt null, status draft)', () => {
    const { result } = renderHook(() => useOrders());
    let o;
    act(() => { o = result.current.createDraftOrder({ supplierName: 'Booker', lines: [line()] }); });
    expect(o.orderedAt).toBe(null);
    expect(statusFor(result.current.orders.find((x) => x.id === o.id))).toBe('draft');
  });

  it('sendOrder places a draft (sets orderedAt → status ordered) and is a no-op on an already-sent order', () => {
    const { result } = renderHook(() => useOrders());
    let id; let sentId;
    act(() => { id = result.current.createDraftOrder({ supplierName: 'Booker', lines: [line()] }).id; });
    act(() => { result.current.sendOrder(id); });
    const o = result.current.orders.find((x) => x.id === id);
    expect(o.orderedAt).toBeTruthy();
    expect(statusFor(o)).toBe('ordered');

    act(() => { sentId = result.current.createOrder({ supplierName: 'X', lines: [line()] }).id; });
    const before = result.current.orders.find((x) => x.id === sentId).orderedAt;
    act(() => { result.current.sendOrder(sentId); }); // already sent → unchanged
    expect(result.current.orders.find((x) => x.id === sentId).orderedAt).toBe(before);
  });

  it('createOrder still defaults to sent (backwards compatible)', () => {
    const { result } = renderHook(() => useOrders());
    let o;
    act(() => { o = result.current.createOrder({ supplierName: 'Booker', lines: [line()] }); });
    expect(o.orderedAt).toBeTruthy();
    expect(statusFor(result.current.orders.find((x) => x.id === o.id))).toBe('ordered');
  });
});

describe('orderStore — incoming stock', () => {
  it('sums outstanding units for open orders only, and excludes received/cancelled', () => {
    const { result } = renderHook(() => useOrders());
    act(() => { result.current.createOrder({ supplierName: 'A', lines: [line({ qty: 10 })] }); });
    act(() => { const o = result.current.createOrder({ supplierName: 'B', lines: [line({ qty: 5 })] }); result.current.markReceived(o.id); });

    const map = incomingByProduct(result.current.orders);
    expect(map.p1).toBe(10); // only the open order's outstanding, not the received 5
    expect(incomingFor(result.current.orders, { id: 'p1', barcode: '111' })).toBeGreaterThanOrEqual(10);
  });

  it('partially received orders report only the remaining as incoming', () => {
    const { result } = renderHook(() => useOrders());
    let id;
    act(() => { id = result.current.createOrder({ supplierName: 'A', lines: [line({ qty: 10 })] }).id; });
    act(() => { result.current.receiveAgainst(id, [{ productId: 'p1', qty: 4 }]); });
    expect(incomingByProduct(result.current.orders).p1).toBe(6);
  });
});

describe('orderStore — signed un-receive (audit W7)', () => {
  it('a negative correction reduces received qty (clamped to [0, ordered])', () => {
    const { result } = renderHook(() => useOrders());
    let id;
    act(() => { id = result.current.createOrder({ supplierName: 'Booker', lines: [line({ qty: 10 })] }).id; });
    act(() => { result.current.receiveAgainst(id, [{ productId: 'p1', qty: 3 }]); });
    expect(result.current.orders.find((o) => o.id === id).lines[0].receivedQty).toBe(3);

    act(() => { result.current.receiveAgainst(id, [{ productId: 'p1', qty: -1 }]); }); // un-receive one
    expect(result.current.orders.find((o) => o.id === id).lines[0].receivedQty).toBe(2);

    act(() => { result.current.receiveAgainst(id, [{ productId: 'p1', qty: -50 }]); }); // can't go below 0
    expect(result.current.orders.find((o) => o.id === id).lines[0].receivedQty).toBe(0);
  });
});
