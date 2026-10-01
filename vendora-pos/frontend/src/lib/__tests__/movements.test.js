import { describe, it, expect } from 'vitest';
import {
  recordMovement, removeByBatch, reverseByBatch, salesUnits, inferredDepletionUnits,
  velocity, daysOfCover, topMovers, movementHistory, reconcileQty, sanitizeMovements, MOVEMENT_TYPES,
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

describe('movementStore — Phase 1.2 traceability', () => {
  it('stamps every row with an actor (Owner for guest/accounts-off)', () => {
    setActiveWorkspace('shop:tr1');
    const rec = recordMovement({ productId: 'p1', type: MOVEMENT_TYPES.WASTE, delta: -2, reason: 'binned' });
    expect(rec.actor).toBe('Owner');
    expect(rec.actorRole).toBe('owner');
  });

  it('sanitizeMovements drops structurally invalid rows', () => {
    const dirty = [
      { productId: 'p1', type: 'sale', delta: -1, at: 1 },      // ok
      { productId: 'p2', type: 'nonsense', delta: -1, at: 2 },  // bad type
      { productId: 'p3', type: 'sale', delta: 0, at: 3 },       // zero delta
      { productId: 'p4', type: 'sale', delta: 'x', at: 4 },     // non-finite
      { productId: 'p5', type: 'sale', delta: -1 },             // no timestamp
      null,                                                      // junk
    ];
    const clean = sanitizeMovements(dirty);
    expect(clean).toHaveLength(1);
    expect(clean[0].productId).toBe('p1');
  });

  it('reverseByBatch appends a compensating correction and keeps the original (idempotent)', () => {
    setActiveWorkspace('shop:tr2');
    const w = recordMovement({ productId: 'p1', type: MOVEMENT_TYPES.WASTE, delta: -3, batchId: 'w1', reason: 'binned' });
    const r1 = reverseByBatch('w1', { reason: 'waste undone' });
    expect(r1.reversed).toBe(1);
    const rows = readJSON('movements_v1', []);
    expect(rows).toHaveLength(2); // original kept + reversal added (not deleted)
    const rev = rows.find((x) => x.reversalOf);
    expect(rev.reversalOf).toBe(w.id);
    expect(rev.delta).toBe(3);                              // negated
    expect(rev.type).toBe(MOVEMENT_TYPES.STOCK_ADJUSTMENT); // a correction, not a sale
    // Idempotent: reversing again does nothing.
    expect(reverseByBatch('w1').reversed).toBe(0);
    expect(readJSON('movements_v1', [])).toHaveLength(2);
  });

  it('movementHistory gives a running balance; reconcileQty exposes the opening balance', () => {
    const now = 1_700_000_000_000;
    const recs = [
      { id: 'a', productId: 'p1', type: 'goods_received', delta: 10, at: now - 3000 },
      { id: 'b', productId: 'p1', type: 'sale', delta: -4, at: now - 2000 },
      { id: 'c', productId: 'p1', type: 'waste', delta: -1, at: now - 1000 },
      { id: 'd', productId: 'p2', type: 'sale', delta: -2, at: now }, // other product, ignored
    ];
    const hist = movementHistory(recs, 'p1'); // newest first
    expect(hist.map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(hist[0].balance).toBe(5);  // 10 - 4 - 1
    expect(hist[2].balance).toBe(10); // after the delivery

    // Current qty 7 but ledger explains 5 → opening balance of 2 (stock present before tracking).
    const recon = reconcileQty(recs, 'p1', 7);
    expect(recon.ledgerSum).toBe(5);
    expect(recon.difference).toBe(2);
    expect(recon.matches).toBe(false);
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
