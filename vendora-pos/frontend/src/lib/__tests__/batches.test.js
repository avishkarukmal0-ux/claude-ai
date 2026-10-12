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

describe('batches — residual undated units keep the product-level date (milk-bug regression)', () => {
  it('date-coding 2 of 3 use-by units keeps the 3rd unit in "Sell first" / at-risk via the product date', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    // 3 units, all under a product-level use-by that's already soon (the demo "Fresh Milk" shape).
    act(() => { id = result.current.addProduct({ name: 'Fresh Milk 2L', cost: 0.8, price: 1.65, qty: 3, expiry: iso(1), dateType: 'use-by' }).id; });
    // Date-code 2 of them into a past-dated batch.
    act(() => { result.current.addBatch(id, { qty: 2, expiry: iso(-1), dateType: 'use-by' }); });

    const rows = fefo(result.current.products);
    const totalUnits = rows.reduce((n, r) => n + r.qty, 0);
    expect(totalUnits).toBe(3); // all three units still accounted for — the 3rd didn't vanish
    expect(rows.some((r) => r.batchId === null && r.qty === 1)).toBe(true); // residual row for the 3rd unit
    expect(rows.some((r) => r.batchId && r.qty === 2)).toBe(true);          // the dated batch of 2
  });
});

describe('products — allergens & ingredients persist (PPDS)', () => {
  it('stores allergens/ingredients on add and merges them on update', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Deli Sandwich', allergens: ['Milk', 'Eggs'], ingredients: 'bread, cheese, egg' }).id; });
    let p = result.current.products.find((x) => x.id === id);
    expect(p.allergens).toEqual(['Milk', 'Eggs']);
    expect(p.ingredients).toBe('bread, cheese, egg');
    act(() => { result.current.updateProduct(id, { allergens: ['Milk', 'Eggs', 'Mustard'] }); });
    p = result.current.products.find((x) => x.id === id);
    expect(p.allergens).toContain('Mustard');
    expect(p.ingredients).toBe('bread, cheese, egg'); // untouched
  });
});

describe('products — delete is undoable (restoreProduct keeps the id)', () => {
  it('removes then restores the exact product, preserving its id', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Cola', qty: 5 }).id; });
    const snap = result.current.products.find((p) => p.id === id);
    act(() => { result.current.removeProduct(id); });
    expect(result.current.products.find((p) => p.id === id)).toBeUndefined();
    act(() => { result.current.restoreProduct(snap); });
    const back = result.current.products.find((p) => p.id === id);
    expect(back).toBeTruthy();
    expect(back.qty).toBe(5); // same id + data → history stays linked
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
