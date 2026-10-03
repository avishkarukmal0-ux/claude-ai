import { describe, it, expect, beforeEach } from 'vitest';
import { reassignProductRefs } from '../productMerge';
import { readJSON, writeJSON, setActiveWorkspace } from '../storage';

let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:merge${ws++}`); });

describe('reassignProductRefs — no stranded references after a product merge (audit D7)', () => {
  it('remaps top-level and nested history stores (movements, markdowns, claims, invoices, deliveries, orders)', () => {
    writeJSON('movements_v1', [{ id: 'm1', productId: 'A' }, { id: 'm2', productId: 'B' }]);
    writeJSON('markdowns_v1', [{ id: 'md1', productId: 'A', name: 'Cola' }, { id: 'md2', productId: 'C' }]);
    writeJSON('claims_v1', [{ id: 'cl1', items: [{ productId: 'A' }, { productId: 'X' }] }]);
    writeJSON('invoices_v1', [{ id: 'inv1', lines: [{ productId: 'A' }] }]);
    writeJSON('deliveries_v1', [{ id: 'd1', lines: [{ productId: 'A' }] }]);
    writeJSON('orders_v1', [{ id: 'o1', lines: [{ productId: 'A', qty: 2 }, { productId: 'Y' }] }]);

    const counts = reassignProductRefs('A', 'B');

    expect(readJSON('movements_v1').find((r) => r.id === 'm1').productId).toBe('B');
    expect(readJSON('markdowns_v1').find((r) => r.id === 'md1').productId).toBe('B');
    expect(readJSON('claims_v1')[0].items[0].productId).toBe('B');
    expect(readJSON('invoices_v1')[0].lines[0].productId).toBe('B');
    expect(readJSON('deliveries_v1')[0].lines[0].productId).toBe('B');
    expect(readJSON('orders_v1')[0].lines[0].productId).toBe('B');
    expect(counts.orders_v1).toBe(1);
    expect(counts.markdowns_v1).toBe(1);
  });

  it('buy list merges the re-pointed row into an existing target row (one row per product)', () => {
    writeJSON('buylist_v1', [
      { id: 'bl1', productId: 'A', name: 'Cola', qty: 2, bought: false },
      { id: 'bl2', productId: 'B', name: 'Cola', qty: 3, bought: false },
      { id: 'bl3', productId: 'C', name: 'Water', qty: 1, bought: true },
    ]);

    const counts = reassignProductRefs('A', 'B');
    const rows = readJSON('buylist_v1');
    const bRows = rows.filter((r) => r.productId === 'B');
    expect(bRows).toHaveLength(1);        // merged, not duplicated
    expect(bRows[0].qty).toBe(5);         // 2 + 3
    expect(rows.find((r) => r.productId === 'C').qty).toBe(1); // untouched
    expect(counts.buylist_v1).toBe(1);
  });

  it('buy list re-points cleanly when the target has no existing row', () => {
    writeJSON('buylist_v1', [{ id: 'bl1', productId: 'A', name: 'Cola', qty: 2, bought: false }]);
    reassignProductRefs('A', 'B');
    const rows = readJSON('buylist_v1');
    expect(rows).toHaveLength(1);
    expect(rows[0].productId).toBe('B');
    expect(rows[0].qty).toBe(2);
  });

  it('active stock-count session renames keyed maps, merging counts/expected and keeping a reason', () => {
    writeJSON('stocktake_v1', {
      id: 's1', counts: { A: 4, B: 1 }, expected: { A: 5, B: 2 }, reasons: { A: 'miscount', B: '' },
    });

    const counts = reassignProductRefs('A', 'B');
    const s = readJSON('stocktake_v1');
    expect('A' in s.counts).toBe(false);  // old key gone — not stranded
    expect(s.counts.B).toBe(5);           // 4 + 1
    expect(s.expected.B).toBe(7);         // 5 + 2
    expect(s.reasons.B).toBe('miscount'); // non-empty reason kept
    expect(counts.stocktake_v1).toBe(1);
  });

  it('active stock-count session re-points a solo product with no target key', () => {
    writeJSON('stocktake_v1', { id: 's1', counts: { A: 3 }, expected: { A: 4 }, reasons: {} });
    reassignProductRefs('A', 'B');
    const s = readJSON('stocktake_v1');
    expect(s.counts).toEqual({ B: 3 });
    expect(s.expected).toEqual({ B: 4 });
  });

  it('is a no-op when fromId === toId or ids are missing', () => {
    writeJSON('movements_v1', [{ id: 'm1', productId: 'A' }]);
    expect(reassignProductRefs('A', 'A')).toEqual({});
    expect(reassignProductRefs(null, 'B')).toEqual({});
    expect(readJSON('movements_v1')[0].productId).toBe('A');
  });
});
