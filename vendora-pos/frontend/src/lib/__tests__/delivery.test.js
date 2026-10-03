import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  toUnits, deliveredUnits, acceptedUnits, orderedUnits, perUnitCost, packSize, deliveryTotals, blankLine,
} from '../deliveryStore';
import { useInventory } from '../inventoryStore';
import { readJSON, setActiveWorkspace } from '../storage';

const movements = () => readJSON('movements_v1', []);
let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:dl${ws++}`); });

describe('delivery — case↔unit conversion', () => {
  const caseLine = blankLine({ qtyMode: 'cases', packSize: 24, deliveredQty: 3, caseCost: 12 });
  it('3 cases of 24 = 72 units', () => {
    expect(packSize(caseLine)).toBe(24);
    expect(toUnits(3, caseLine)).toBe(72);
    expect(deliveredUnits(caseLine)).toBe(72);
  });
  it('per-unit cost = case cost ÷ pack size', () => {
    expect(perUnitCost(caseLine)).toBe(0.5); // 12 / 24
  });
  it('accepted defaults to delivered, and honours an explicit partial', () => {
    expect(acceptedUnits(caseLine)).toBe(72);
    expect(acceptedUnits({ ...caseLine, acceptedQty: 2 })).toBe(48); // 2 cases accepted
  });
  it('ordered units convert too and feed discrepancy detection', () => {
    const l = { ...caseLine, orderedQty: 4 };
    expect(orderedUnits(l)).toBe(96);
    const totals = deliveryTotals({ lines: [l] });
    expect(totals.discrepancies).toBe(1); // delivered 72 < ordered 96
  });
});

describe('delivery — applying to stock', () => {
  it('creates a new product from a case delivery with per-unit cost, no retail price', () => {
    const { result } = renderHook(() => useInventory());
    const delivery = { id: 'op-1', reference: 'INV1', lines: [blankLine({ barcode: '111', name: 'Cola', qtyMode: 'cases', packSize: 24, deliveredQty: 3, caseCost: 12 })] };
    let res;
    act(() => { res = result.current.applyDelivery(delivery); });
    expect(res.ok).toBe(true);
    expect(res.applied).toBe(72);
    const p = result.current.products.find((x) => x.barcode === '111');
    expect(p.qty).toBe(72);
    expect(p.cost).toBe(0.5);
    expect(p.price).toBeNull(); // retail never set automatically
    expect(movements().filter((m) => m.type === 'goods_received' && m.operationId === 'op-1').length).toBe(1);
  });

  it('is idempotent — re-submitting the same delivery does not double stock', () => {
    const { result } = renderHook(() => useInventory());
    const delivery = { id: 'op-2', lines: [blankLine({ barcode: '222', name: 'Beans', qtyMode: 'units', deliveredQty: 10, unitCost: 0.4 })] };
    act(() => { result.current.applyDelivery(delivery); });
    let dup;
    act(() => { dup = result.current.applyDelivery(delivery); });
    expect(dup.ok).toBe(false);
    expect(dup.duplicate).toBe(true);
    expect(result.current.products.find((x) => x.barcode === '222').qty).toBe(10); // not 20
  });

  it('partial acceptance only adds accepted units', () => {
    const { result } = renderHook(() => useInventory());
    const delivery = { id: 'op-3', lines: [blankLine({ barcode: '333', name: 'Crisps', qtyMode: 'cases', packSize: 24, deliveredQty: 3, acceptedQty: 2, caseCost: 12 })] };
    act(() => { result.current.applyDelivery(delivery); });
    expect(result.current.products.find((x) => x.barcode === '333').qty).toBe(48); // 2 cases accepted, not 3
  });

  it('updates purchase cost but never the retail price of an existing product', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ barcode: '444', name: 'Milk', cost: 0.8, price: 1.65, qty: 2 }).id; });
    const delivery = { id: 'op-4', lines: [blankLine({ barcode: '444', name: 'Milk', qtyMode: 'units', deliveredQty: 6, unitCost: 0.9 })] };
    act(() => { result.current.applyDelivery(delivery); });
    const p = result.current.products.find((x) => x.id === id);
    expect(p.qty).toBe(8);       // 2 + 6
    expect(p.cost).toBe(0.9);    // purchase cost updated
    expect(p.price).toBe(1.65);  // retail unchanged
  });
});
