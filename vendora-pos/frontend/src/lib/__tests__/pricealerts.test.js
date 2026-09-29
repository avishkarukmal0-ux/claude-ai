import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { isMaterialCostChange, marginOf, retailForMargin, recordCostChange } from '../priceAlertStore';
import { useInventory } from '../inventoryStore';
import { blankLine } from '../deliveryStore';
import { readJSON, setActiveWorkspace } from '../storage';

const alerts = () => readJSON('price_alerts_v1', []);
let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:pa${ws++}`); });

describe('priceAlertStore — pure maths', () => {
  it('flags only material cost changes (>=5% and >=1p)', () => {
    expect(isMaterialCostChange(1.0, 1.2)).toBe(true);
    expect(isMaterialCostChange(1.0, 1.02)).toBe(false); // 2% < 5%
    expect(isMaterialCostChange(null, 1.2)).toBe(false);
    expect(isMaterialCostChange(0, 1)).toBe(false);
  });

  it('margin and suggested retail preserve the old margin at the new cost', () => {
    expect(marginOf(0.5, 1.0)).toBeCloseTo(0.5);
    expect(marginOf(null, 1.0)).toBeNull();
    expect(retailForMargin(0.6, 0.5)).toBeCloseTo(1.2); // 0.6 / (1-0.5)
  });

  it('recordCostChange logs an alert with margin impact + suggested retail; ignores noise', () => {
    expect(recordCostChange({ productId: 'p1', name: 'Cola', prevCost: 0.5, newCost: 0.6, price: 1.0 })).toBeTruthy();
    const a = alerts()[0];
    expect(a.prevMargin).toBeCloseTo(0.5);
    expect(a.newMargin).toBeCloseTo(0.4);
    expect(a.suggestedRetail).toBeCloseTo(1.2); // hold 50% margin at cost 0.6
    expect(recordCostChange({ productId: 'p1', name: 'Cola', prevCost: 0.5, newCost: 0.51, price: 1 })).toBeNull(); // 2% noise
  });
});

describe('priceAlertStore — delivery raises an alert, retail never auto-changes', () => {
  it('a cost jump on receiving queues an alert and leaves retail untouched', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ barcode: '111', name: 'Milk', cost: 0.8, price: 1.6, qty: 2 }).id; });
    const delivery = { id: 'd1', lines: [blankLine({ barcode: '111', name: 'Milk', qtyMode: 'units', deliveredQty: 6, unitCost: 1.0 })] };
    act(() => { result.current.applyDelivery(delivery); });

    const p = result.current.products.find((x) => x.id === id);
    expect(p.cost).toBe(1.0);        // purchase cost updated
    expect(p.price).toBe(1.6);       // retail NOT auto-changed
    expect((p.costHistory || []).length).toBe(1); // history preserved
    const list = alerts();
    expect(list.length).toBe(1);
    expect(list[0].productId).toBe(id);
    expect(list[0].status).toBe('open');
  });
});
