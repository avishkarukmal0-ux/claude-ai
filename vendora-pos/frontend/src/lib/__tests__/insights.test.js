import { describe, it, expect } from 'vitest';
import { stockValue, slowStockValue, avgMargin, projectedWeeklySales, categoryBreakdown } from '../insights';
import { MOVEMENT_TYPES } from '../movementStore';

const DAY = 86400000;
const old = Date.now() - 60 * DAY;

describe('insights — categoryBreakdown', () => {
  const now = Date.now();
  const products = [
    { id: 'a', category: 'Confectionery', qty: 10, cost: 1, price: 2 },
    { id: 'b', category: 'Confectionery', qty: 4, cost: 2, price: 5 },
    { id: 'c', category: null, qty: 3, cost: 1, price: 2 }, // uncategorised
  ];
  const records = [
    { productId: 'a', type: MOVEMENT_TYPES.SALE, delta: -6, at: now - 2 * DAY },
    { productId: 'b', type: MOVEMENT_TYPES.SALE, delta: -1, at: now - 1 * DAY },
    { productId: 'a', type: MOVEMENT_TYPES.WASTE, delta: -2, at: now - 1 * DAY }, // never counts as sale
  ];

  it('aggregates stock value, units sold and sales value per category', () => {
    const rows = categoryBreakdown(products, records, 28, now);
    const conf = rows.find((r) => r.category === 'Confectionery');
    expect(conf.products).toBe(2);
    expect(conf.unitsSold).toBe(7);                 // 6 + 1 (waste excluded)
    expect(conf.salesValue).toBe(6 * 2 + 1 * 5);    // 17
    expect(conf.stockValue).toBe(10 * 1 + 4 * 2);   // 18
  });

  it('includes an Uncategorised bucket and sorts by sales value', () => {
    const rows = categoryBreakdown(products, records, 28, now);
    expect(rows.some((r) => r.category === 'Uncategorised')).toBe(true);
    expect(rows[0].category).toBe('Confectionery'); // highest sales value first
  });
});

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
