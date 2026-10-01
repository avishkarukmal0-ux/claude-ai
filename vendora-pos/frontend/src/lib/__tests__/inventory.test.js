import React, { StrictMode } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInventory, margin, costKnown, normalisePackSize, matchBarcode } from '../inventoryStore';
import { salesUnits, inferredDepletionUnits } from '../movementStore';
import { readJSON, setActiveWorkspace } from '../storage';

const movements = () => readJSON('movements_v1', []);
let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:inv${ws++}`); });

describe('inventory — pack size + barcode identification', () => {
  it('normalisePackSize keeps whole numbers ≥ 2, else null (sold as singles)', () => {
    expect(normalisePackSize(24)).toBe(24);
    expect(normalisePackSize('12')).toBe(12);
    expect(normalisePackSize(1)).toBeNull();   // a "case of 1" is just a single
    expect(normalisePackSize(0)).toBeNull();
    expect(normalisePackSize('')).toBeNull();
    expect(normalisePackSize('abc')).toBeNull();
    expect(normalisePackSize(23.6)).toBe(24);  // rounded
  });

  it('matchBarcode identifies a single barcode as 1 unit', () => {
    const products = [{ id: 'a', barcode: '5000112637922', packSize: 24, caseBarcode: '15000112637929' }];
    const r = matchBarcode(products, '5000112637922');
    expect(r).toMatchObject({ unit: 'single', multiplier: 1 });
    expect(r.product.id).toBe('a');
  });

  it('matchBarcode identifies a case barcode as a full case (×packSize)', () => {
    const products = [{ id: 'a', barcode: '5000112637922', packSize: 24, caseBarcode: '15000112637929' }];
    const r = matchBarcode(products, '15000112637929');
    expect(r).toMatchObject({ unit: 'case', multiplier: 24 });
    expect(r.product.id).toBe('a');
  });

  it('matchBarcode returns null for an unknown code, and is blank-safe', () => {
    const products = [{ id: 'a', barcode: '111', caseBarcode: null }];
    expect(matchBarcode(products, '999')).toBeNull();
    expect(matchBarcode(products, '')).toBeNull();
    expect(matchBarcode(null, '111')).toBeNull();
  });

  it('a case with no/invalid packSize falls back to multiplier 1', () => {
    const products = [{ id: 'a', barcode: '111', caseBarcode: '222', packSize: 1 }];
    expect(matchBarcode(products, '222')).toMatchObject({ unit: 'case', multiplier: 1 });
  });
});

describe('inventory — margin honesty (finding 2E)', () => {
  it('unknown/blank/invalid cost → null (not a fake 100% margin)', () => {
    expect(margin({ cost: null, price: 10 })).toBeNull();
    expect(margin({ cost: '', price: 10 })).toBeNull();
    expect(margin({ cost: 'abc', price: 10 })).toBeNull();
    expect(costKnown({ cost: null })).toBe(false);
  });
  it('explicit zero cost is a real 100% margin; normal cost computes', () => {
    expect(margin({ cost: 0, price: 10 })).toBe(1);
    expect(margin({ cost: 6, price: 10 })).toBeCloseTo(0.4);
    expect(costKnown({ cost: 0 })).toBe(true);
  });
});

describe('inventory — quantity decrease is an adjustment, never a sale (2C/2D)', () => {
  it('updateProduct(-qty) logs exactly one stock_adjustment and zero sales', () => {
    const { result } = renderHook(() => useInventory(), { wrapper: StrictMode });
    let id;
    act(() => { id = result.current.addProduct({ name: 'Milk', cost: 1, price: 2, qty: 10 }).id; });
    act(() => { result.current.updateProduct(id, { qty: 7 }); });

    const recs = movements();
    const adj = recs.filter((r) => r.type === 'stock_adjustment' && r.productId === id);
    expect(adj.length).toBe(1);            // exactly once, even under StrictMode
    expect(adj[0].delta).toBe(-3);
    expect(salesUnits(recs, id)).toBe(0);  // NOT a sale
    expect(inferredDepletionUnits(recs, id)).toBe(3);
    expect(result.current.products.find((p) => p.id === id).qty).toBe(7);
  });
});

describe('inventory — waste reduces stock exactly once with undo (2B)', () => {
  it('recordWaste reduces stock once, logs one waste movement, and reverseWaste restores', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Yoghurt', cost: 0.5, price: 1, qty: 6 }).id; });

    act(() => { result.current.recordWaste({ id, qty: 2, batchId: 'wb1' }); });
    expect(result.current.products.find((p) => p.id === id).qty).toBe(4);
    let recs = movements();
    expect(recs.filter((r) => r.type === 'waste').length).toBe(1);
    expect(salesUnits(recs, id)).toBe(0); // waste is not a sale

    act(() => { result.current.reverseWaste({ id, qty: 2, batchId: 'wb1' }); });
    expect(result.current.products.find((p) => p.id === id).qty).toBe(6); // restored
    recs = movements();
    expect(recs.filter((r) => r.type === 'waste').length).toBe(0); // movement removed
  });

  it('cannot bin more than is in stock', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Bread', cost: 0.5, price: 1, qty: 2 }).id; });
    let res;
    act(() => { res = result.current.recordWaste({ id, qty: 5 }); });
    expect(res.applied).toBe(2);
    expect(result.current.products.find((p) => p.id === id).qty).toBe(0);
  });
});

describe('inventory — explicit sales + stocktake typing', () => {
  it('sellUnits logs a sale and reduces stock', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Cola', cost: 0.5, price: 1.2, qty: 10 }).id; });
    act(() => { result.current.sellUnits(id, 3); });
    expect(result.current.products.find((p) => p.id === id).qty).toBe(7);
    expect(salesUnits(movements(), id)).toBe(3);
  });

  it('setCounts (stocktake) logs a stock_adjustment, not a sale', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Water', cost: 0.2, price: 0.8, qty: 12 }).id; });
    act(() => { result.current.setCounts({ [id]: 9 }); });
    expect(result.current.products.find((p) => p.id === id).qty).toBe(9);
    const recs = movements();
    expect(salesUnits(recs, id)).toBe(0);
    expect(recs.filter((r) => r.type === 'stock_adjustment' && r.reason === 'stocktake').length).toBe(1);
  });
});
