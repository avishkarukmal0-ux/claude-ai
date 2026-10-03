import { describe, it, expect } from 'vitest';
import {
  lineUnits, lineUnitCost, lineTotal, invoiceTotal, invoiceFingerprint, findDuplicateInvoice, matchLines,
} from '../invoiceStore';

describe('invoiceStore — pack/unit normalisation', () => {
  it('units: a cases line expands by pack size; a units line is literal', () => {
    expect(lineUnits({ qty: 2, qtyMode: 'cases', packSize: 24 })).toBe(48);
    expect(lineUnits({ qty: 10, qtyMode: 'units' })).toBe(10);
    expect(lineUnits({ qty: 3, qtyMode: 'cases' })).toBe(3); // no pack size → treat as 1
  });

  it('unit cost: case cost normalises to per-unit; unit cost used directly', () => {
    expect(lineUnitCost({ qtyMode: 'cases', caseCost: 24, packSize: 24 })).toBe(1);
    expect(lineUnitCost({ qtyMode: 'units', unitCost: 1.29 })).toBe(1.29);
    expect(lineUnitCost({ qtyMode: 'cases', packSize: 12, caseCost: 18 })).toBe(1.5);
  });

  it('line total = unit cost × units, across unit/case expression', () => {
    expect(lineTotal({ qty: 2, qtyMode: 'cases', packSize: 24, caseCost: 24 })).toBe(48); // 48 units × £1
    expect(lineTotal({ qty: 10, qtyMode: 'units', unitCost: 1.5 })).toBe(15);
    // Audit D4: a case whose unit cost doesn't divide to whole pennies must bill the whole-case cost, not a
    // rounded per-unit × units (£10/24 = £0.4166… → old code gave £0.42 × 24 = £10.08).
    expect(lineTotal({ qty: 1, qtyMode: 'cases', packSize: 24, caseCost: 10 })).toBe(10);
    expect(lineTotal({ qty: 100, qtyMode: 'cases', packSize: 3, caseCost: 1 })).toBe(100); // £1/3 × 3 × 100 = £100
  });

  it('invoice total sums line totals', () => {
    const inv = { lines: [
      { qty: 2, qtyMode: 'cases', packSize: 24, caseCost: 24 },
      { qty: 10, qtyMode: 'units', unitCost: 1.5 },
    ] };
    expect(invoiceTotal(inv)).toBe(63);
  });
});

describe('invoiceStore — duplicate detection', () => {
  const base = { id: 'a', supplierName: 'Booker', reference: 'INV-100', date: Date.UTC(2026, 9, 1), lines: [{ qty: 1, qtyMode: 'units', unitCost: 10 }] };
  it('same supplier+ref+date+total fingerprints equal; a different ref does not', () => {
    const dupe = { ...base, id: 'b' };
    const other = { ...base, id: 'c', reference: 'INV-200' };
    expect(invoiceFingerprint(dupe)).toBe(invoiceFingerprint(base));
    expect(invoiceFingerprint(other)).not.toBe(invoiceFingerprint(base));
  });
  it('findDuplicateInvoice ignores the same id and finds a real duplicate', () => {
    const existing = [base];
    expect(findDuplicateInvoice({ ...base, id: 'a' }, existing)).toBeNull(); // itself
    expect(findDuplicateInvoice({ ...base, id: 'b' }, existing)).toMatchObject({ id: 'a' });
    expect(findDuplicateInvoice({ ...base, id: 'c', reference: 'X' }, existing)).toBeNull();
  });
});

describe('invoiceStore — product matching (reuses barcode/name resolver)', () => {
  const products = [
    { id: 'p1', name: 'Cola 330ml', barcode: '5000112' },
    { id: 'p2', name: 'Water 500ml', barcode: '5000999' },
  ];
  it('matches by barcode, then by name, else flags unmatched', () => {
    const out = matchLines([
      { id: 'l1', barcode: '5000112', name: 'whatever' },
      { id: 'l2', barcode: '', name: 'water 500ml' },
      { id: 'l3', barcode: '', name: 'Unknown item' },
    ], products);
    expect(out[0]).toMatchObject({ matched: true, productId: 'p1' });
    expect(out[1]).toMatchObject({ matched: true, productId: 'p2' });
    expect(out[2]).toMatchObject({ matched: false, productId: null });
  });
});
