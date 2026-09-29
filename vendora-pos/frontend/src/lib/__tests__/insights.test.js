import { describe, it, expect } from 'vitest';
import { stockValue, slowStockValue, avgMargin, projectedWeeklySales } from '../insights';

const DAY = 86400000;
const old = Date.now() - 60 * DAY;

describe('insights — unknown cost never valued at £0 (finding 2E)', () => {
  const products = [
    { id: 'p1', qty: 10, cost: 1, price: 2 },
    { id: 'p2', qty: 5, cost: null, price: 3 },   // unknown cost
    { id: 'p3', qty: 4, cost: '', price: 2 },     // blank cost
  ];

  it('stockValue counts only known-cost stock and reports unknown coverage', () => {
    const s = stockValue(products);
    expect(s.value).toBe(10);        // only p1
    expect(s.unknownCount).toBe(2);  // p2, p3
    expect(s.knownCount).toBe(1);
  });

  it('avgMargin ignores unknown-cost products but still reports how many were priced', () => {
    const m = avgMargin(products);
    expect(m.knownCount).toBe(1);
    expect(m.pricedCount).toBe(3);
    expect(m.value).toBeCloseTo(0.5); // p1 only: (2-1)/2
  });
});

describe('insights — slow stock valuation', () => {
  it('values only known-cost slow stock', () => {
    const products = [
      { id: 'a', qty: 10, cost: 2, price: 3, createdAt: old, lastSoldAt: null },
      { id: 'b', qty: 3, cost: null, price: 3, createdAt: old, lastSoldAt: null },
    ];
    const s = slowStockValue(products, 30);
    expect(s.value).toBe(20);        // a only
    expect(s.count).toBe(2);
    expect(s.unknownCount).toBe(1);
  });
});

describe('insights — projection basis', () => {
  it('labels the projection "sales" when confirmed sales exist', () => {
    const products = [{ id: 'p1', qty: 10, cost: 1, price: 2 }];
    const records = [{ productId: 'p1', type: 'sale', delta: -7, at: Date.now() - DAY }];
    const proj = projectedWeeklySales(products, records);
    expect(proj.basis).toBe('sales');
    expect(proj.value).toBeGreaterThan(0);
  });

  it('returns null when there is no sell-through evidence', () => {
    const products = [{ id: 'p1', qty: 10, cost: 1, price: 2 }];
    const proj = projectedWeeklySales(products, []);
    expect(proj.value).toBeNull();
    expect(proj.basis).toBeNull();
  });
});
