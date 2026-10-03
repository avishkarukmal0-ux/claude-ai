import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useInventory, shelfTracked, shelfQtyOf, backQtyOf, needsRefill, stockStatus,
} from '../inventoryStore';
import { salesUnits } from '../movementStore';
import { readJSON, setActiveWorkspace } from '../storage';

const movements = () => readJSON('movements_v1', []);
let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:cl${ws++}`); });

describe('applyCounts — snapshot-safe (counts with intervening movements)', () => {
  it('applies the count correction to CURRENT stock, not a stale total', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Beans', cost: 0.5, price: 1, qty: 10 }).id; });

    // Counter sees 10 and counts 9 (one missing). Meanwhile a delivery adds 5 → current is 15.
    act(() => { result.current.receiveLines([{ barcode: '', name: 'Beans', qty: 5 }]); });
    // NB receiveLines created a new line by barcode-less match? ensure we bump the same product:
    // instead adjust the same product directly to simulate an intervening sale of 2:
    act(() => { result.current.updateProduct(id, { qty: (result.current.products.find((p) => p.id === id).qty) - 2 }); });

    const current = result.current.products.find((p) => p.id === id).qty;
    // Apply the count: counted 9 against expectedAt 10 → correction -1, applied to CURRENT.
    act(() => { result.current.applyCounts([{ id, counted: 9, expectedAt: 10 }]); });
    const after = result.current.products.find((p) => p.id === id).qty;
    expect(after).toBe(current - 1); // intervening change preserved, only the -1 correction applied
    expect(after).not.toBe(9);       // did NOT blindly overwrite with the stale count
  });

  it('marks countedAt and never records a sale', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Milk', cost: 1, price: 2, qty: 5 }).id; });
    act(() => { result.current.applyCounts([{ id, counted: 4, expectedAt: 5, reason: 'damaged' }]); });
    const p = result.current.products.find((x) => x.id === id);
    expect(p.qty).toBe(4);
    expect(p.countedAt).toBeTruthy();
    expect(stockStatus(p).basis).toBe('counted');
    expect(salesUnits(movements(), id)).toBe(0);
    expect(movements().some((m) => m.type === 'stock_adjustment' && /damaged/.test(m.reason || ''))).toBe(true);
  });
});

describe('locations & transfer — total shop stock preserved', () => {
  it('transferring to the shelf moves the split but not the total', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Cola', cost: 0.5, price: 1.2, qty: 20 }).id; });
    act(() => { result.current.setShelfQty(id, 0); }); // all out back
    let p = result.current.products.find((x) => x.id === id);
    expect(shelfTracked(p)).toBe(true);
    expect(needsRefill(p)).toBe(true); // shelf 0, back 20

    act(() => { result.current.transferStock(id, 8, 'to_shelf'); });
    p = result.current.products.find((x) => x.id === id);
    expect(p.qty).toBe(20);           // TOTAL unchanged
    expect(shelfQtyOf(p)).toBe(8);
    expect(backQtyOf(p)).toBe(12);
    expect(needsRefill(p)).toBe(false);
    expect(movements().filter((m) => m.type === 'transfer').length).toBe(1);
  });

  it('cannot move more to the shelf than exists, and clamps at total', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Water', cost: 0.2, price: 0.8, qty: 6 }).id; });
    act(() => { result.current.setShelfQty(id, 0); });
    act(() => { result.current.transferStock(id, 99, 'to_shelf'); });
    const p = result.current.products.find((x) => x.id === id);
    expect(shelfQtyOf(p)).toBe(6);   // clamped to total
    expect(p.qty).toBe(6);           // total still unchanged
  });

  it('untracked products report no shelf/back and are not refill candidates', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Bread', qty: 3 }).id; });
    const p = result.current.products.find((x) => x.id === id);
    expect(shelfTracked(p)).toBe(false);
    expect(backQtyOf(p)).toBeNull();
    expect(needsRefill(p)).toBe(false);
  });
});
