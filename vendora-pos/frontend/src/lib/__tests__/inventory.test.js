import React, { StrictMode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInventory, margin, costKnown, normalisePackSize, matchBarcode, reconcileAllocations, markSold, worstExpiry } from '../inventoryStore';
import { salesUnits, inferredDepletionUnits } from '../movementStore';
import * as storageNs from '../storage';
import { readJSON, writeJSON, setActiveWorkspace } from '../storage';

const movements = () => readJSON('movements_v1', []);
let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:inv${ws++}`); });

describe('inventory — allocation reconcile + imported sales (audit W2/W12)', () => {
  it('reconcileAllocations caps shelfQty and trims dated batches to total (latest-expiry first)', () => {
    const p = {
      qty: 7, shelfQty: 10,
      batches: [{ id: 'early', qty: 5, expiry: '2026-01-01' }, { id: 'late', qty: 5, expiry: '2026-12-31' }],
    };
    const out = reconcileAllocations(p);
    expect(out.shelfQty).toBe(7);                       // shelf capped to total
    const sum = out.batches.reduce((n, b) => n + b.qty, 0);
    expect(sum).toBe(7);                                // batches no longer exceed total (was 10)
    expect(out.batches.find((b) => b.id === 'early').qty).toBe(5); // urgent (earliest) batch preserved
    expect(out.batches.find((b) => b.id === 'late').qty).toBe(2);  // excess trimmed from latest-expiry
  });

  it('a product already consistent is returned unchanged', () => {
    const p = { qty: 10, shelfQty: 4, batches: [{ id: 'a', qty: 3, expiry: '2026-06-01' }] };
    expect(reconcileAllocations(p)).toEqual(p);
  });

  it('markSold updates lastSoldAt without changing qty, and never moves it backwards', () => {
    const ws = storage_setup();
    writeJSON('inventory_v1', [{ id: 'x', qty: 5, lastSoldAt: 1000 }], ws);
    markSold({ x: 5000 });
    expect(readJSON('inventory_v1', [], ws).find((p) => p.id === 'x')).toMatchObject({ qty: 5, lastSoldAt: 5000 });
    markSold({ x: 2000 }); // older — ignored
    expect(readJSON('inventory_v1', [], ws).find((p) => p.id === 'x').lastSoldAt).toBe(5000);
  });
});

function storage_setup() {
  const ws = `shop:mark${Math.random().toString(36).slice(2, 6)}`;
  // eslint-disable-next-line no-undef
  setActiveWorkspace(ws);
  return ws;
}

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
  it('recordWaste reduces stock once; reverseWaste restores AND keeps history (compensating reversal)', () => {
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
    // History is RETAINED (Phase 1.2d): the original waste stays, a compensating +2 correction is added.
    expect(recs.filter((r) => r.type === 'waste').length).toBe(1);        // original kept, not deleted
    const rev = recs.find((r) => r.reversalOf);
    expect(rev).toBeTruthy();
    expect(rev.delta).toBe(2);                                            // negates the -2 waste
    expect(rev.type).toBe('stock_adjustment');                           // a correction, not a sale
    expect(salesUnits(recs, id)).toBe(0);                                 // never a sale
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

describe('inventory — worstExpiry batch-aware (audit W3)', () => {
  const now = new Date('2026-10-01');
  it('flags an expired use-by BATCH even when the product-level date is fine', () => {
    const p = { expiry: '2026-12-01', dateType: 'best-before', batches: [{ id: 'b', qty: 2, expiry: '2026-09-20', dateType: 'use-by' }] };
    const ei = worstExpiry(p, now);
    expect(ei.mustPull).toBe(true); // the expired use-by batch wins
  });
  it('returns null when nothing is dated', () => {
    expect(worstExpiry({ qty: 5 }, now)).toBeNull();
  });
});

describe('audit D3 — a failed stock write must not report success or log a movement', () => {
  it('applyCounts returns ok:false on a failed persist (count session retained, no adjustment logged)', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Milk', cost: 1, price: 2, qty: 10 }).id; });
    const spy = vi.spyOn(storageNs, 'writeJSON').mockReturnValue({ ok: false, error: 'quota' });
    let res;
    act(() => { res = result.current.applyCounts([{ id, counted: 4 }]); });
    spy.mockRestore();
    expect(res.ok).toBe(false);
    expect(readJSON('inventory_v1', []).find((p) => p.id === id).qty).toBe(10); // unchanged — not saved
    expect(movements().filter((m) => m.type === 'stock_adjustment').length).toBe(0); // no phantom movement
  });

  it('wasteBatch returns ok:false on a failed persist (no waste movement, stock not reported binned)', () => {
    const { result } = renderHook(() => useInventory());
    let id; let batchId;
    act(() => { id = result.current.addProduct({ name: 'Bread', cost: 0.5, price: 1, qty: 6 }).id; });
    act(() => { batchId = result.current.addBatch(id, { qty: 4, expiry: '2099-01-01', dateType: 'use-by' }).batchId; });
    const spy = vi.spyOn(storageNs, 'writeJSON').mockReturnValue({ ok: false, error: 'quota' });
    let res;
    act(() => { res = result.current.wasteBatch({ id, batchId, qty: 2, opGroupId: 'wbD3' }); });
    spy.mockRestore();
    expect(res.ok).toBe(false);
    expect(readJSON('inventory_v1', []).find((p) => p.id === id).qty).toBe(6); // unchanged
    expect(movements().filter((m) => m.type === 'waste').length).toBe(0); // no phantom waste movement
  });

  it('D3 r2: wasteBatch rolls stock back when the HISTORY write fails (no success with missing history)', () => {
    const { result } = renderHook(() => useInventory());
    let id; let batchId;
    act(() => { id = result.current.addProduct({ name: 'Yoghurt', cost: 0.5, price: 1, qty: 6 }).id; });
    act(() => { batchId = result.current.addBatch(id, { qty: 4, expiry: '2099-01-01', dateType: 'use-by' }).batchId; });
    const orig = storageNs.writeJSON; // stock write succeeds; only the movements (ledger) write fails
    const spy = vi.spyOn(storageNs, 'writeJSON').mockImplementation((name, value, ws) => (name === 'movements_v1' ? { ok: false, error: 'quota' } : orig(name, value, ws)));
    let res;
    act(() => { res = result.current.wasteBatch({ id, batchId, qty: 2, opGroupId: 'wbD3r2' }); });
    spy.mockRestore();
    expect(res.ok).toBe(false);
    expect(readJSON('inventory_v1', []).find((p) => p.id === id).qty).toBe(6); // rolled back (not 4)
    expect(movements().filter((m) => m.type === 'waste').length).toBe(0);
  });

  it('R4: recordWaste rolls stock back when the ledger write fails (was missing the round-2 verify)', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Milk', cost: 0.5, price: 1, qty: 6 }).id; });
    const orig = storageNs.writeJSON; // stock write succeeds; only the movements (ledger) write fails
    const spy = vi.spyOn(storageNs, 'writeJSON').mockImplementation((name, value, ws) => (name === 'movements_v1' ? { ok: false, error: 'quota' } : orig(name, value, ws)));
    let res;
    act(() => { res = result.current.recordWaste({ id, qty: 2, batchId: 'rwR4' }); });
    spy.mockRestore();
    expect(res.ok).toBe(false);
    expect(readJSON('inventory_v1', []).find((p) => p.id === id).qty).toBe(6); // rolled back (not 4)
    expect(movements().filter((m) => m.type === 'waste').length).toBe(0);      // no phantom waste movement
  });

  it('R4: recordWaste returns needsRecovery when the ledger AND the rollback both fail', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Bread', cost: 0.5, price: 1, qty: 6 }).id; });
    const orig = storageNs.writeJSON;
    let invCalls = 0; // the decrement succeeds; the ledger fails; the rollback (2nd inventory write) also fails
    const spy = vi.spyOn(storageNs, 'writeJSON').mockImplementation((name, value, ws) => {
      if (name === 'movements_v1') return { ok: false };
      if (name === 'inventory_v1') { invCalls += 1; return invCalls === 1 ? orig(name, value, ws) : { ok: false, error: 'quota' }; }
      return orig(name, value, ws);
    });
    let res;
    act(() => { res = result.current.recordWaste({ id, qty: 2, batchId: 'rwR4b' }); });
    spy.mockRestore();
    expect(res.ok).toBe(false);
    expect(res.unsafe).toBe(true);
    expect(res.needsRecovery).toBe(true); // distinct signal — the caller records a DURABLE block, not a plain retry
  });

  it('D3 r2: applyCounts rolls stock back when the stocktake ledger write fails', () => {
    const { result } = renderHook(() => useInventory());
    let id;
    act(() => { id = result.current.addProduct({ name: 'Eggs', cost: 1, price: 2, qty: 10 }).id; });
    const orig = storageNs.writeJSON;
    const spy = vi.spyOn(storageNs, 'writeJSON').mockImplementation((name, value, ws) => (name === 'movements_v1' ? { ok: false } : orig(name, value, ws)));
    let res;
    act(() => { res = result.current.applyCounts([{ id, counted: 4 }]); });
    spy.mockRestore();
    expect(res.ok).toBe(false);
    expect(readJSON('inventory_v1', []).find((p) => p.id === id).qty).toBe(10); // rolled back (not 4)
    expect(movements().filter((m) => m.type === 'stock_adjustment').length).toBe(0);
  });

  it('D3 r2: reverseWaste does NOT reverse the ledger when the stock-restore write fails', () => {
    const { result } = renderHook(() => useInventory());
    let id; let batchId;
    act(() => { id = result.current.addProduct({ name: 'Rolls', cost: 0.5, price: 1, qty: 6 }).id; });
    act(() => { batchId = result.current.addBatch(id, { qty: 4, expiry: '2099-01-01', dateType: 'use-by' }).batchId; });
    act(() => { result.current.wasteBatch({ id, batchId, qty: 2, opGroupId: 'wRev' }); }); // a real waste first
    const orig = storageNs.writeJSON; // now the reverse's stock-restore write fails
    const spy = vi.spyOn(storageNs, 'writeJSON').mockImplementation((name, value, ws) => (name === 'inventory_v1' ? { ok: false, error: 'quota' } : orig(name, value, ws)));
    let res;
    act(() => { res = result.current.reverseWaste({ id, qty: 2, batchId: 'wRev' }); });
    spy.mockRestore();
    expect(res.ok).toBe(false);
    // The ledger was NOT reversed (no "waste undone" correction), so stock+history stay consistent for a retry.
    expect(movements().filter((m) => m.reason === 'waste undone').length).toBe(0);
  });
});
