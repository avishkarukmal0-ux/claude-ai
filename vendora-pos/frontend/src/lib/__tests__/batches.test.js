import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useInventory, batchesOf, datedQty, undatedQty, fefo,
} from '../inventoryStore';
import { salesUnits } from '../movementStore';
import { readJSON, setActiveWorkspace } from '../storage';

const movements = () => readJSON('movements_v1', []);
const iso = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:bt${ws++}`); });

describe('batches — date-coding allocates from undated, total unchanged', () => {
  it('addBatch moves undated stock into a dated batch without changing the total', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Yoghurt', cost: 0.5, price: 1, qty: 10 }).id; });
    act(() => { result.current.addBatch(id, { qty: 4, expiry: iso(2), dateType: 'use-by' }); });
    const p = result.current.products.find((x) => x.id === id);
    expect(p.qty).toBe(10);            // total unchanged
    expect(datedQty(p)).toBe(4);
    expect(undatedQty(p)).toBe(6);
    expect(batchesOf(p).length).toBe(1);
  });

  it('cannot date-code more than the undated remainder', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Milk', cost: 0.9, price: 1.6, qty: 3 }).id; });
    let res;
    act(() => { res = result.current.addBatch(id, { qty: 10, expiry: iso(1), dateType: 'use-by' }); });
    expect(res.allocated).toBe(3);
    expect(undatedQty(result.current.products.find((x) => x.id === id))).toBe(0);
  });
});

describe('batches — FEFO ordering & hard-stop flag', () => {
  it('lists near/expired batches soonest-first and flags hard use-by pulls', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Cream', cost: 0.5, price: 1.2, qty: 10 }).id; });
    act(() => { result.current.addBatch(id, { qty: 2, expiry: iso(5), dateType: 'best-before' }); });
    act(() => { result.current.addBatch(id, { qty: 3, expiry: iso(-1), dateType: 'use-by' }); }); // expired use-by

    const rows = fefo(result.current.products);
    expect(rows.length).toBe(2);
    expect(rows[0].info.daysLeft).toBeLessThanOrEqual(rows[1].info.daysLeft); // soonest first
    const expired = rows.find((r) => r.info.status === 'expired');
    expect(expired.info.mustPull).toBe(true); // hard-stop → pull, no sell
  });
});

describe('batches — binning the correct batch once', () => {
  it('wasteBatch reduces the right batch and the total exactly once; undo restores both', () => {
    const { result } = renderHook(() => useInventory());
    let id; let batchId;
    act(() => { id = result.current.addProduct({ name: 'Salad', cost: 0.6, price: 1.5, qty: 8 }).id; });
    act(() => { const r = result.current.addBatch(id, { qty: 5, expiry: iso(-1), dateType: 'use-by' }); batchId = r.batchId; });

    let res;
    act(() => { res = result.current.wasteBatch({ id, batchId, qty: 2, opGroupId: 'g1' }); });
    expect(res.ok).toBe(true);
    let p = result.current.products.find((x) => x.id === id);
    expect(p.qty).toBe(6);                 // 8 − 2
    expect(datedQty(p)).toBe(3);           // batch 5 − 2
    expect(movements().filter((m) => m.type === 'waste' && m.productBatchId === batchId).length).toBe(1);
    expect(salesUnits(movements(), id)).toBe(0); // never a sale

    act(() => { result.current.reverseBatchWaste({ id, qty: 2, opGroupId: 'g1', batch: res.batch }); });
    p = result.current.products.find((x) => x.id === id);
    expect(p.qty).toBe(8);                 // restored
    expect(datedQty(p)).toBe(5);           // batch restored
    // Phase 1.2d: the waste movement is RETAINED and a compensating correction is added (history kept).
    expect(movements().filter((m) => m.type === 'waste').length).toBe(1);
    expect(movements().some((m) => m.reversalOf && m.delta === 2)).toBe(true);
  });

  it('cannot bin more than the batch holds', () => {
    const { result } = renderHook(() => useInventory());
    let id; let batchId;
    act(() => { id = result.current.addProduct({ name: 'Wrap', cost: 0.7, price: 2, qty: 4 }).id; });
    act(() => { const r = result.current.addBatch(id, { qty: 2, expiry: iso(0), dateType: 'use-by' }); batchId = r.batchId; });
    let res;
    act(() => { res = result.current.wasteBatch({ id, batchId, qty: 9, opGroupId: 'g2' }); });
    expect(res.applied).toBe(2);
    expect(result.current.products.find((x) => x.id === id).qty).toBe(2); // 4 − 2
  });
});
