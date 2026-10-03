import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  parseCSV, guessMapping, parseQty, parseAmount, parseDate, dayStart, hashRows,
  buildImport, useSalesImport, isDuplicateImport,
} from '../salesImportStore';
import { velocity } from '../movementStore';
import { readJSON, setActiveWorkspace } from '../storage';

let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:si${ws++}`); });
const DAY = 86400000;

describe('parseCSV', () => {
  it('handles quotes, escaped quotes, commas in fields, BOM and CRLF', () => {
    const text = '﻿Barcode,Name,Qty\r\n"501","Beans, Heinz",3\r\n"502","He said ""hi""",1\r\n';
    const { headers, rows } = parseCSV(text);
    expect(headers).toEqual(['Barcode', 'Name', 'Qty']);
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual(['501', 'Beans, Heinz', '3']);
    expect(rows[1][1]).toBe('He said "hi"');
  });

  it('drops fully-blank rows and returns empty for junk', () => {
    expect(parseCSV('').rows).toEqual([]);
    const { rows } = parseCSV('a,b\n1,2\n\n , \n3,4\n');
    expect(rows).toEqual([['1', '2'], ['3', '4']]);
  });
});

describe('guessMapping', () => {
  it('maps common EPOS headers and never assigns one column twice', () => {
    const m = guessMapping(['Product Code', 'Product Name', 'Qty Sold', 'Sale Date', 'Total']);
    expect(m.barcode).toBe(0);   // "Product Code" → barcode, not name
    expect(m.name).toBe(1);
    expect(m.qty).toBe(2);
    expect(m.date).toBe(3);
    expect(m.amount).toBe(4);
    expect(new Set(Object.values(m)).size).toBe(5); // all distinct
  });

  it('returns -1 for fields with no matching header', () => {
    const m = guessMapping(['foo', 'bar']);
    expect(m.qty).toBe(-1);
    expect(m.barcode).toBe(-1);
  });
});

describe('value parsing', () => {
  it('parseQty strips symbols; rejects non-numbers', () => {
    expect(parseQty('3')).toBe(3);
    expect(parseQty(' 12 ')).toBe(12);
    expect(parseQty('abc')).toBeNaN();
  });
  it('parseAmount handles £ and blanks', () => {
    expect(parseAmount('£4.50')).toBe(4.5);
    expect(parseAmount('')).toBeNull();
  });
  it('parseDate reads UK dd/mm/yyyy (not mm/dd) and ISO', () => {
    // 02/03/2026 must be 2 March, not 3 Feb
    const uk = new Date(parseDate('02/03/2026'));
    expect(uk.getMonth()).toBe(2); // March
    expect(uk.getDate()).toBe(2);
    const iso = new Date(parseDate('2026-03-02'));
    expect(iso.getMonth()).toBe(2);
    expect(parseDate('nonsense')).toBeNull();
  });
});

describe('hashRows', () => {
  it('is order-independent and content-sensitive', () => {
    const a = [{ key: 'p1', qty: 2, day: 1 }, { key: 'p2', qty: 3, day: 1 }];
    const b = [{ key: 'p2', qty: 3, day: 1 }, { key: 'p1', qty: 2, day: 1 }];
    expect(hashRows(a)).toBe(hashRows(b));
    const c = [{ key: 'p1', qty: 9, day: 1 }, { key: 'p2', qty: 3, day: 1 }];
    expect(hashRows(a)).not.toBe(hashRows(c));
  });
});

describe('buildImport', () => {
  const now = Date.parse('2026-03-10T10:00:00Z');
  const products = [
    { id: 'p1', name: 'Milk 2L', barcode: '501' },
    { id: 'p2', name: 'Bread', barcode: '502' },
  ];

  it('matches by barcode then name, skips unmatched, aggregates per product/day', () => {
    const rows = [
      ['501', 'Milk 2L', '2', '02/03/2026'],
      ['501', 'Milk 2L', '3', '02/03/2026'],   // same product+day → aggregates to 5
      ['', 'Bread', '4', '03/03/2026'],         // matched by name
      ['999', 'Mystery', '1', '03/03/2026'],    // unmatched → skipped
      ['502', 'Bread', '0', '03/03/2026'],      // zero qty → invalid
    ];
    const mapping = { barcode: 0, name: 1, qty: 2, date: 3, amount: -1 };
    const a = buildImport({ rows, mapping, products, now });
    expect(a.unmatched.length).toBe(1);
    expect(a.invalid.length).toBe(1);
    expect(a.productsMatched).toBe(2);
    expect(a.unitsTotal).toBe(9); // 5 milk + 4 bread
    const milkDay = a.lines.find((l) => l.productId === 'p1');
    expect(milkDay.units).toBe(5); // aggregated
    expect(a.lines.length).toBe(2); // one bucket per product/day
  });

  it('skips rows older than the retention window', () => {
    const rows = [
      ['501', '', '2', '01/03/2026'],   // within window
      ['501', '', '9', '01/01/2020'],   // ancient → tooOld
    ];
    const mapping = { barcode: 0, name: 1, qty: 2, date: 3, amount: -1 };
    const a = buildImport({ rows, mapping, products, now });
    expect(a.tooOld).toBe(1);
    expect(a.unitsTotal).toBe(2);
  });

  it('uses defaultDate when no date column, and sums sale value when mapped', () => {
    const rows = [['501', '£3.30', '2'], ['502', '£2.20', '2']];
    const mapping = { barcode: 0, amount: 1, qty: 2, name: -1, date: -1 };
    const a = buildImport({ rows, mapping, products, defaultDate: now, now });
    expect(a.hasValue).toBe(true);
    expect(a.valueTotal).toBeCloseTo(5.5, 2);
    expect(a.from).toBe(dayStart(now));
  });
});

describe('useSalesImport — apply / idempotency / undo', () => {
  const now = Date.now();
  const products = [{ id: 'p1', name: 'Milk 2L', barcode: '501' }];
  const rows = [
    ['501', '4', String(dayStart(now - 20 * DAY))],
    ['501', '6', String(dayStart(now - 5 * DAY))],
  ];
  const mapping = { barcode: 0, qty: 1, date: 2, name: -1, amount: -1 };

  function analyse() { return buildImport({ rows: rows.map((r) => [r[0], r[1], new Date(Number(r[2])).toISOString()]), mapping, products, now }); }

  it('records confirmed sale movements without touching inventory, and lifts velocity basis to sales', () => {
    const inv = readJSON('inventory_v1', null); // untouched by import
    const { result } = renderHook(() => useSalesImport());
    const a = analyse();
    let res;
    act(() => { res = result.current.applyImport(a, { fileName: 'z-report.csv' }); });
    expect(res.ok).toBe(true);

    const movements = readJSON('movements_v1', []);
    expect(movements.length).toBe(2); // one per day bucket
    expect(movements.every((m) => m.type === 'sale' && m.delta < 0)).toBe(true);
    expect(readJSON('inventory_v1', null)).toEqual(inv); // stock unchanged

    const v = velocity(movements, 'p1', 28, now);
    expect(v.basis).toBe('sales'); // was 'estimated'/null before
    expect(v.vpd).toBeGreaterThan(0);

    expect(result.current.imports.length).toBe(1);
    expect(result.current.imports[0].unitsTotal).toBe(10);
  });

  it('blocks a duplicate re-import (idempotent), then allows it again after undo', () => {
    const { result } = renderHook(() => useSalesImport());
    const a = analyse();
    act(() => { result.current.applyImport(a, { fileName: 'z-report.csv' }); });
    expect(isDuplicateImport(a.importId)).toBe(true);

    let res2;
    act(() => { res2 = result.current.applyImport(a, { fileName: 'z-report.csv' }); });
    expect(res2.ok).toBe(false);
    expect(res2.reason).toBe('duplicate');
    expect(readJSON('movements_v1', []).length).toBe(2); // not doubled

    let removed;
    act(() => { removed = result.current.undoImport(a.importId); });
    expect(removed).toBe(2);
    expect(readJSON('movements_v1', []).length).toBe(0);
    expect(isDuplicateImport(a.importId)).toBe(false);
    expect(result.current.imports.length).toBe(0);
  });
});

describe('sales import — impossible/future dates (audit W11)', () => {
  it('parseDate rejects a non-existent calendar date (31/02/2026)', () => {
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('32/01/2026')).toBeNull();
    expect(parseDate('15/03/2026')).not.toBeNull(); // a real date still parses
  });

  it('buildImport rejects rows dated in the future', () => {
    const now = Date.UTC(2026, 9, 1); // 1 Oct 2026
    const products = [{ id: 'p1', barcode: '111', name: 'A' }];
    const rows = [['111', '5', '01/01/2027']]; // future
    const res = buildImport({ rows, mapping: { barcode: 0, qty: 1, date: 2 }, products, now });
    expect(res.matchedRows).toBe(0);
    expect(res.invalid.some((i) => i.reason === 'future')).toBe(true);
  });
});
