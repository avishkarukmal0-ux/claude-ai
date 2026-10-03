import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useInventory, matchBarcode, findDuplicateProducts, codesOf, productByAnyCode, matchBySupplierAlias,
} from '../inventoryStore';
import { matchLines } from '../invoiceStore';
import { recordMovement, MOVEMENT_TYPES } from '../movementStore';
import { readJSON, setActiveWorkspace, __resetMemForTest } from '../storage';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
});

describe('product matching — multiple barcodes (Phase 2.7a)', () => {
  it('resolves an extra barcode to its product as a single unit', () => {
    const products = [{ id: 'p1', barcode: '111', extraBarcodes: ['222', '333'] }];
    expect(matchBarcode(products, '222')).toMatchObject({ unit: 'single', multiplier: 1 });
    expect(matchBarcode(products, '333').product.id).toBe('p1');
    expect(matchBarcode(products, '999')).toBeNull();
  });

  it('codesOf lists every code; productByAnyCode finds clashes (not self)', () => {
    const p = { id: 'a', barcode: '1', caseBarcode: '2', extraBarcodes: ['3'] };
    expect(codesOf(p)).toEqual(['1', '2', '3']);
    expect(productByAnyCode([p], '3', { exceptId: 'b' }).id).toBe('a');
    expect(productByAnyCode([p], '3', { exceptId: 'a' })).toBeNull();
  });

  it('addBarcode links a code and refuses one owned by another product', () => {
    setActiveWorkspace('shop:bc1');
    const { result } = renderHook(() => useInventory());
    let a; let b;
    act(() => { a = result.current.addProduct({ name: 'A', barcode: '111' }); });
    act(() => { b = result.current.addProduct({ name: 'B', barcode: '999' }); });
    expect(b.id).toBeTruthy();

    let r;
    act(() => { r = result.current.addBarcode(a.id, '222'); });
    expect(r.ok).toBe(true);
    expect(matchBarcode(result.current.products, '222').product.id).toBe(a.id);

    act(() => { r = result.current.addBarcode(a.id, '999'); }); // belongs to B
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already belongs/i);
  });
});

describe('product matching — supplier aliases (Phase 2.7b)', () => {
  it('matchBySupplierAlias matches by code or name, scoped to a supplier when given', () => {
    const products = [{ id: 'p1', name: 'Shelf Name', supplierAliases: [{ supplierId: 's1', code: 'ABC', name: 'Supplier Name' }] }];
    expect(matchBySupplierAlias(products, { code: 'ABC' }).id).toBe('p1');
    expect(matchBySupplierAlias(products, { name: 'supplier name' }).id).toBe('p1'); // case-insensitive
    expect(matchBySupplierAlias(products, { code: 'ABC', supplierId: 's2' })).toBeNull(); // wrong supplier
    expect(matchBySupplierAlias(products, { code: 'XYZ' })).toBeNull();
  });

  it('matchLines resolves an invoice line via a supplier alias when barcode/name do not match', () => {
    const products = [{ id: 'p1', name: 'Fizzy Pop', barcode: '111', supplierAliases: [{ supplierId: null, code: 'SUP-9', name: '' }] }];
    const matched = matchLines([{ barcode: 'SUP-9', name: 'UNKNOWN' }], products);
    expect(matched[0].productId).toBe('p1');
    expect(matched[0].matched).toBe(true);
  });
});

describe('product matching — duplicate detect + merge (Phase 2.7e/f)', () => {
  it('detects duplicates by shared barcode and by name', () => {
    const products = [
      { id: 'p1', name: 'Coke 330ml', barcode: '111' },
      { id: 'p2', name: 'coke 330ml', barcode: '222' }, // same name, different code
      { id: 'p3', name: 'Water', barcode: '111' },       // shares a code with p1
    ];
    const groups = findDuplicateProducts(products);
    expect(groups.some((g) => g.reason === 'barcode')).toBe(true);
    expect(groups.some((g) => g.reason === 'name')).toBe(true);
    expect(groups[0].reason).toBe('barcode'); // strong matches first
  });

  it('merges two products: unions barcodes, sums stock, re-points history, drops the duplicate', () => {
    setActiveWorkspace('shop:mg1');
    const { result } = renderHook(() => useInventory());
    let keep; let drop;
    act(() => { keep = result.current.addProduct({ name: 'Keep', barcode: '111', qty: 5 }); });
    act(() => { drop = result.current.addProduct({ name: 'Drop', barcode: '222', qty: 3 }); });
    recordMovement({ productId: drop.id, type: MOVEMENT_TYPES.GOODS_RECEIVED, delta: 3 }); // history on the dup

    let r;
    act(() => { r = result.current.mergeProducts(keep.id, drop.id); });
    expect(r.ok).toBe(true);
    expect(result.current.products).toHaveLength(1);

    const merged = result.current.products[0];
    expect(merged.id).toBe(keep.id);
    expect(merged.qty).toBe(8);                 // 5 + 3
    expect(merged.extraBarcodes).toContain('222'); // dup's code preserved as an extra barcode

    const movements = readJSON('movements_v1', []);
    expect(movements.find((m) => m.productId === drop.id)).toBeUndefined(); // re-pointed
    expect(movements.some((m) => m.productId === keep.id)).toBe(true);
  });
});
