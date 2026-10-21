import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readJSON, writeJSON, setActiveWorkspace } from '../storage';
import { buildImport, compareImport, useSalesImport } from '../salesImportStore';
import { deductImportedSales, restoreImportedSales } from '../inventoryStore';
import {
  loadPosSettings, enableDeductions, disableDeductions, canManageDeductions,
} from '../posSettingsStore';
import { MOVEMENT_TYPES } from '../movementStore';

const DAY = 86400000;
// Anchor to the real clock: movementStore prunes rows older than 180 days relative to Date.now(), so a
// hard-coded past epoch would be pruned on write and the ledger would read empty.
const NOW = Date.now();

function seedProducts(list) { writeJSON('inventory_v1', list); }
function qtyOf(id) { return (readJSON('inventory_v1', []).find((p) => p.id === id) || {}).qty; }
function movements() { return readJSON('movements_v1', []); }

// A buildImport analysis for `rows` [{ barcode, qty, date }] against `products`.
function analysisFor(rows, products, { mapping, now = NOW, defaultDate = null } = {}) {
  const headers = ['barcode', 'qty', 'date'];
  const map = mapping || { barcode: 0, name: -1, qty: 1, date: 2, amount: -1 };
  return buildImport({ rows: rows.map((r) => [r.barcode, String(r.qty), r.date || '']), mapping: map, products, now, defaultDate });
}

describe('compareImport (pure — no stock change)', () => {
  beforeEach(() => { setActiveWorkspace('shop:cmp'); });

  it('reports imported-vs-current and never-negative implied remaining', () => {
    const products = [{ id: 'p1', name: 'Cola', barcode: '111', qty: 10 }, { id: 'p2', name: 'Crisps', barcode: '222', qty: 3 }];
    const a = analysisFor([
      { barcode: '111', qty: 4, date: new Date(NOW).toISOString() },
      { barcode: '222', qty: 9, date: new Date(NOW).toISOString() },
    ], products);
    const cmp = compareImport(a, { products });
    const cola = cmp.rows.find((r) => r.productId === 'p1');
    const crisps = cmp.rows.find((r) => r.productId === 'p2');
    expect(cola.impliedRemaining).toBe(6);         // 10 - 4
    expect(crisps.impliedRemaining).toBe(0);        // 3 - 9 clamps at 0, never negative
    expect(cmp.totalsOnly).toBe(false);
    // Pure: writes nothing.
    expect(movements().length).toBe(0);
  });

  it('flags a totals-only file (no item rows) so it can never deduct', () => {
    const products = [{ id: 'p1', name: 'Cola', barcode: '111', qty: 10 }];
    const a = analysisFor([['', '', '']], products, { mapping: { barcode: -1, name: -1, qty: 1, date: -1, amount: 0 } });
    const cmp = compareImport(a, { products });
    expect(cmp.totalsOnly).toBe(true);
    expect(cmp.rows.length).toBe(0);
  });

  it('splits deductible vs historical around the opening baseline', () => {
    const products = [{ id: 'p1', name: 'Cola', barcode: '111', qty: 100 }];
    const baseline = NOW - 5 * DAY;
    const a = analysisFor([
      { barcode: '111', qty: 7, date: new Date(NOW - 10 * DAY).toISOString() }, // before baseline → historical
      { barcode: '111', qty: 4, date: new Date(NOW - 2 * DAY).toISOString() },  // after baseline → deductible
    ], products);
    const cmp = compareImport(a, { products, openingStockAt: baseline });
    expect(cmp.deductibleUnits).toBe(4);
    expect(cmp.historicalUnits).toBe(7);
  });
});

describe('deductImportedSales (opt-in stock deduction primitive)', () => {
  beforeEach(() => { setActiveWorkspace(`shop:ded${Math.random().toString(36).slice(2)}`); });

  it('reduces qty and logs a SALE movement, capped at available stock', () => {
    seedProducts([{ id: 'p1', name: 'Cola', qty: 10 }, { id: 'p2', name: 'Crisps', qty: 3 }]);
    const res = deductImportedSales([
      { productId: 'p1', units: 4, at: NOW },
      { productId: 'p2', units: 9, at: NOW }, // more than in stock → caps at 3
    ], { operationId: 'op1', batchId: 'op1' });
    expect(res.ok).toBe(true);
    expect(res.deducted).toBe(7);           // 4 + 3 (capped)
    expect(qtyOf('p1')).toBe(6);
    expect(qtyOf('p2')).toBe(0);            // never negative
    const sales = movements().filter((m) => m.type === MOVEMENT_TYPES.SALE);
    expect(sales.reduce((n, m) => n + (-m.delta), 0)).toBe(7); // ledger matches qty change exactly
  });

  it('is idempotent — re-applying the same operationId is a no-op', () => {
    seedProducts([{ id: 'p1', name: 'Cola', qty: 10 }]);
    expect(deductImportedSales([{ productId: 'p1', units: 2, at: NOW }], { operationId: 'dup', batchId: 'dup' }).ok).toBe(true);
    const second = deductImportedSales([{ productId: 'p1', units: 2, at: NOW }], { operationId: 'dup', batchId: 'dup' });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('duplicate');
    expect(qtyOf('p1')).toBe(8); // only deducted once
  });

  it('requires an operationId and never invents products', () => {
    seedProducts([{ id: 'p1', name: 'Cola', qty: 10 }]);
    expect(deductImportedSales([{ productId: 'p1', units: 1, at: NOW }], {}).ok).toBe(false);
    const res = deductImportedSales([{ productId: 'ghost', units: 5, at: NOW }], { operationId: 'op2' });
    expect(res.deducted).toBe(0); // unknown product skipped, no movement
    expect(movements().length).toBe(0);
  });

  it('restoreImportedSales adds stock back and removes the movements (re-importable)', () => {
    seedProducts([{ id: 'p1', name: 'Cola', qty: 10 }]);
    deductImportedSales([{ productId: 'p1', units: 4, at: NOW }], { operationId: 'opR', batchId: 'opR' });
    expect(qtyOf('p1')).toBe(6);
    const r = restoreImportedSales('opR');
    expect(r.ok).toBe(true);
    expect(r.restored).toBe(4);
    expect(qtyOf('p1')).toBe(10); // fully restored
    expect(movements().filter((m) => m.batchId === 'opR').length).toBe(0); // movements gone → re-importable
  });
});

describe('posSettingsStore (owner-only opt-in, opening baseline)', () => {
  beforeEach(() => { setActiveWorkspace(`shop:set${Math.random().toString(36).slice(2)}`); });

  it('defaults OFF', () => {
    expect(loadPosSettings().deductEnabled).toBe(false);
  });

  it('owner/manager can enable (records a baseline); staff cannot', () => {
    expect(canManageDeductions('staff')).toBe(false);
    expect(enableDeductions({ role: 'staff' }).ok).toBe(false);
    expect(loadPosSettings().deductEnabled).toBe(false);

    const res = enableDeductions({ role: 'owner', at: NOW, member: { name: 'Avishka' } });
    expect(res.ok).toBe(true);
    const s = loadPosSettings();
    expect(s.deductEnabled).toBe(true);
    expect(s.openingStockAt).toBe(NOW);
    expect(s.enabledBy).toBe('Avishka');
  });

  it('disable reverts to evidence-only but keeps the baseline on record', () => {
    enableDeductions({ role: 'owner', at: NOW });
    disableDeductions({ role: 'owner' });
    const s = loadPosSettings();
    expect(s.deductEnabled).toBe(false);
    expect(s.openingStockAt).toBe(NOW);
  });
});

describe('useSalesImport.applyImport — deduct mode', () => {
  beforeEach(() => { setActiveWorkspace(`shop:ai${Math.random().toString(36).slice(2)}`); });

  it('velocity mode records evidence WITHOUT changing stock', () => {
    seedProducts([{ id: 'p1', name: 'Cola', barcode: '111', qty: 10 }]);
    const products = readJSON('inventory_v1', []);
    const a = analysisFor([{ barcode: '111', qty: 3, date: new Date(NOW).toISOString() }], products);
    const { result } = renderHook(() => useSalesImport());
    let out;
    act(() => { out = result.current.applyImport(a, { fileName: 'f.csv' }); });
    expect(out.ok).toBe(true);
    expect(qtyOf('p1')).toBe(10); // unchanged
    expect(movements().filter((m) => m.type === MOVEMENT_TYPES.SALE).length).toBe(1);
  });

  it('deduct mode only deducts sales at/after the cutoff and tags the entry', () => {
    seedProducts([{ id: 'p1', name: 'Cola', barcode: '111', qty: 20 }]);
    const products = readJSON('inventory_v1', []);
    const cutoff = NOW - 3 * DAY;
    const a = analysisFor([
      { barcode: '111', qty: 5, date: new Date(NOW - 10 * DAY).toISOString() }, // historical — must NOT deduct
      { barcode: '111', qty: 6, date: new Date(NOW - 1 * DAY).toISOString() },  // after cutoff — deducts
    ], products);
    const { result } = renderHook(() => useSalesImport());
    let out;
    act(() => { out = result.current.applyImport(a, { fileName: 'f.csv' }, { deduct: true, cutoff }); });
    expect(out.ok).toBe(true);
    expect(out.deducted).toBe(6);
    expect(qtyOf('p1')).toBe(14); // 20 - 6 (the 5 historical units are untouched)
    const entry = readJSON('sales_imports_v1', []).find((im) => im.importId === a.importId);
    expect(entry.deducted).toBe(true);
    expect(entry.openingStockAt).toBe(cutoff);
  });

  it('refuses to deduct without an opening baseline', () => {
    seedProducts([{ id: 'p1', name: 'Cola', barcode: '111', qty: 10 }]);
    const products = readJSON('inventory_v1', []);
    const a = analysisFor([{ barcode: '111', qty: 2, date: new Date(NOW).toISOString() }], products);
    const { result } = renderHook(() => useSalesImport());
    let out;
    act(() => { out = result.current.applyImport(a, { fileName: 'f.csv' }, { deduct: true, cutoff: null }); });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('no-baseline');
    expect(qtyOf('p1')).toBe(10);
  });

  it('undo of a deducted import restores stock', () => {
    seedProducts([{ id: 'p1', name: 'Cola', barcode: '111', qty: 20 }]);
    const products = readJSON('inventory_v1', []);
    const a = analysisFor([{ barcode: '111', qty: 6, date: new Date(NOW).toISOString() }], products);
    const { result } = renderHook(() => useSalesImport());
    act(() => { result.current.applyImport(a, { fileName: 'f.csv' }, { deduct: true, cutoff: NOW - DAY }); });
    expect(qtyOf('p1')).toBe(14);
    act(() => { result.current.undoImport(a.importId); });
    expect(qtyOf('p1')).toBe(20); // restored
  });
});
