import { describe, it, expect } from 'vitest';
import {
  recordMovement, removeByBatch, salesUnits, inferredDepletionUnits,
  velocity, daysOfCover, topMovers, MOVEMENT_TYPES,
} from '../movementStore';
import { readJSON, setActiveWorkspace } from '../storage';

const now = 1_700_000_000_000;
const DAY = 86400000;

describe('movementStore — typed recording', () => {
  it('records a valid typed movement and rejects bad input', () => {
    setActiveWorkspace('shop:mv1');
    const rec = recordMovement({ productId: 'p1', type: MOVEMENT_TYPES.SALE, delta: -2 });
    expect(rec).toBeTruthy();
    expect(rec.type).toBe('sale');
    expect(readJSON('movements_v1', []).length).toBe(1);

    expect(recordMovement({ productId: 'p1', type: 'nonsense', delta: -1 })).toBeNull();
    expect(recordMovement({ productId: 'p1', type: MOVEMENT_TYPES.SALE, delta: 0 })).toBeNull();
  });

  it('removeByBatch drops linked movements (waste undo)', () => {
    setActiveWorkspace('shop:mv2');
    recordMovement({ productId: 'p1', type: MOVEMENT_TYPES.WASTE, delta: -1, batchId: 'b1' });
    recordMovement({ productId: 'p1', type: MOVEMENT_TYPES.SALE, delta: -1 });
    expect(readJSON('movements_v1', []).length).toBe(2);
    const removed = removeByBatch('b1');
    expect(removed).toBe(1);
    expect(readJSON('movements_v1', []).length).toBe(1);
  });
});

describe('movementStore — velocity uses sales evidence only', () => {
  const recs = [
    { productId: 'p1', type: 'sale', delta: -3, at: now - 2 * DAY },
    { productId: 'p1', type: 'sale', delta: -4, at: now - 5 * DAY },
    { productId: 'p1', type: 'waste', delta: -10, at: now - 3 * DAY },     // must NOT count
    { productId: 'p1', type: 'goods_received', delta: 20, at: now - 6 * DAY },
    { productId: 'p2', type: 'stock_adjustment', delta: -8, at: now - 4 * DAY }, // estimate basis
    { productId: 'p3', type: 'waste', delta: -5, at: now - 4 * DAY },        // waste only → no basis
  ];

  it('salesUnits counts only sale movements', () => {
    expect(salesUnits(recs, 'p1', 28, now)).toBe(7); // 3 + 4, ignores the waste
    expect(salesUnits(recs, 'p3', 28, now)).toBe(0);
  });

  it('inferredDepletion counts only negative stock_adjustments', () => {
    expect(inferredDepletionUnits(recs, 'p2', 28, now)).toBe(8);
    expect(inferredDepletionUnits(recs, 'p1', 28, now)).toBe(0);
  });

  it('velocity basis is "sales" when real sales exist', () => {
    const v = velocity(recs, 'p1', 28, now);
    expect(v.basis).toBe('sales');
    expect(v.vpd).toBeGreaterThan(0);
  });

  it('velocity basis is "estimated" from adjustments when no sales', () => {
    const v = velocity(recs, 'p2', 28, now);
    expect(v.basis).toBe('estimated');
    expect(v.vpd).toBeGreaterThan(0);
  });

  it('velocity is null when only waste exists (no sales, no adjustments)', () => {
    const v = velocity(recs, 'p3', 28, now);
    expect(v.basis).toBeNull();
    expect(v.vpd).toBeNull();
  });

  it('daysOfCover is Infinity with no velocity, finite otherwise', () => {
    expect(daysOfCover(10, null)).toBe(Infinity);
    expect(daysOfCover(10, 2)).toBe(5);
  });

  it('topMovers ranks by confirmed sales only', () => {
    const top = topMovers(recs, 28, now, 5);
    expect(top.map((t) => t.productId)).toContain('p1');
    // p3 (waste only) and p2 (adjustment only) are not "sold"
    expect(top.map((t) => t.productId)).not.toContain('p3');
    expect(top.map((t) => t.productId)).not.toContain('p2');
  });
});
