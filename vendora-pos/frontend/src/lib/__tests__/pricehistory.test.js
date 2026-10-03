import { describe, it, expect } from 'vitest';
import { priceSeries, priceHistory } from '../priceHistory';

const inv = (o) => ({ id: 'i', status: 'committed', date: 0, lines: [], ...o });
const line = (o) => ({ productId: 'p1', qtyMode: 'units', unitCost: 0, ...o });

describe('priceHistory', () => {
  it('priceSeries uses committed invoices only, chronological, pack-normalised', () => {
    const invoices = [
      inv({ id: 'a', date: 200, lines: [line({ unitCost: 1.2 })] }),
      inv({ id: 'b', date: 100, lines: [line({ qtyMode: 'cases', packSize: 10, caseCost: 10 })] }), // £1/unit
      inv({ id: 'c', status: 'draft', date: 300, lines: [line({ unitCost: 9 })] }), // ignored (draft)
    ];
    const s = priceSeries(invoices, 'p1');
    expect(s.map((x) => x.unitCost)).toEqual([1, 1.2]); // date 100 then 200; draft excluded
  });

  it('priceHistory reports change % and flags margin pressure when margin falls', () => {
    const products = [{ id: 'p1', name: 'Cola', price: 2 }];
    const invoices = [
      inv({ id: 'a', date: 100, lines: [line({ unitCost: 1.0 })] }),   // margin (2-1)/2 = 50%
      inv({ id: 'b', date: 200, lines: [line({ unitCost: 1.4 })] }),   // margin (2-1.4)/2 = 30% → pressure
    ];
    const [row] = priceHistory(invoices, products);
    expect(row.prev.unitCost).toBe(1);
    expect(row.latest.unitCost).toBe(1.4);
    expect(row.changePct).toBe(40);
    expect(row.marginPressure).toBe(true);
  });

  it('a product never on a committed invoice is omitted', () => {
    const products = [{ id: 'p1', name: 'Cola', price: 2 }, { id: 'p2', name: 'Water', price: 1 }];
    const invoices = [inv({ date: 100, lines: [line({ productId: 'p1', unitCost: 1 })] })];
    const rows = priceHistory(invoices, products);
    expect(rows.map((r) => r.productId)).toEqual(['p1']);
  });
});
