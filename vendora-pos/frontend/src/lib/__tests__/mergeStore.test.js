import { describe, it, expect } from 'vitest';
import {
  mergeById, mergeMovements, mergeInventory, mergeStoreArrays, ledgerSum,
  liveItems, tombstone, isTombstone, TOMBSTONE_TTL_DAYS,
  mergeTombstones, tombstoneMap, applyTombstones,
} from '../mergeStore';

const DAY = 86400000;

describe('mergeById — union + newest-wins + tombstones', () => {
  it('unions items that exist on only one side', () => {
    const out = mergeById([{ id: 'a', updatedAt: 1 }], [{ id: 'b', updatedAt: 1 }]);
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });

  it('newer updatedAt wins for the same id (either side)', () => {
    const local = [{ id: 'a', v: 'local', updatedAt: 200 }];
    const server = [{ id: 'a', v: 'server', updatedAt: 100 }];
    expect(mergeById(local, server).find((x) => x.id === 'a').v).toBe('local');
    // and the other way round
    expect(mergeById([{ id: 'a', v: 'local', updatedAt: 100 }], [{ id: 'a', v: 'server', updatedAt: 200 }])
      .find((x) => x.id === 'a').v).toBe('server');
  });

  it('a tie keeps the server copy (deterministic convergence)', () => {
    const out = mergeById([{ id: 'a', v: 'local', updatedAt: 100 }], [{ id: 'a', v: 'server', updatedAt: 100 }]);
    expect(out.find((x) => x.id === 'a').v).toBe('server');
  });

  it('falls back to createdAt when updatedAt is absent', () => {
    const out = mergeById([{ id: 'a', v: 'L', createdAt: 50 }], [{ id: 'a', v: 'S', createdAt: 10 }]);
    expect(out.find((x) => x.id === 'a').v).toBe('L');
  });

  it('a delete tombstone out-votes a stale live copy (no resurrection)', () => {
    const now = Date.now();
    const local = [tombstone('a', now)];                        // deleted on this device just now
    const server = [{ id: 'a', v: 'old', updatedAt: now - 1000 }]; // other device still has the old live copy
    const out = mergeById(local, server, { now });
    const a = out.find((x) => x.id === 'a');
    expect(isTombstone(a)).toBe(true);                // stays deleted
    expect(liveItems(out)).toEqual([]);
  });

  it('a live edit NEWER than the delete wins (re-created/edited after the delete elsewhere)', () => {
    const now = Date.now();
    const local = [tombstone('a', now - 1000)];
    const server = [{ id: 'a', v: 'revived', updatedAt: now }];
    const out = mergeById(local, server, { now });
    expect(isTombstone(out.find((x) => x.id === 'a'))).toBe(false);
    expect(liveItems(out)[0].v).toBe('revived');
  });

  it('garbage-collects tombstones older than the TTL', () => {
    const now = 1_000_000_000_000;
    const old = tombstone('old', now - (TOMBSTONE_TTL_DAYS + 1) * DAY);
    const recent = tombstone('recent', now - DAY);
    const out = mergeById([old, recent], [], { now });
    expect(out.map((x) => x.id)).toEqual(['recent']); // old tombstone dropped
  });

  it('drops items without an id (can\'t be merged safely)', () => {
    const out = mergeById([{ updatedAt: 1 }, { id: 'a', updatedAt: 1 }], []);
    expect(out.map((x) => x.id)).toEqual(['a']);
  });
});

describe('mergeMovements — append-only union', () => {
  it('keeps both devices\' rows and dedupes identical ids', () => {
    const local = [{ id: 'm1', productId: 'p', delta: -2, at: 10 }];
    const server = [{ id: 'm2', productId: 'p', delta: -3, at: 20 }, { id: 'm1', productId: 'p', delta: -2, at: 10 }];
    const out = mergeMovements(local, server);
    expect(out.map((r) => r.id).sort()).toEqual(['m1', 'm2']);
  });
});

describe('ledgerSum', () => {
  it('sums signed deltas for one product only', () => {
    const recs = [{ productId: 'p', delta: -2 }, { productId: 'p', delta: 5 }, { productId: 'q', delta: 9 }];
    expect(ledgerSum(recs, 'p')).toBe(3);
    expect(ledgerSum(recs, 'q')).toBe(9);
    expect(ledgerSum(recs, 'none')).toBe(0);
  });
});

describe('mergeInventory — stock qty from the merged ledger, not last-write-wins', () => {
  it('keeps BOTH devices\' concurrent stock changes (the core bug)', () => {
    // Both started at qty 10 (opening 10, no movements). Device L sells 2; device S sells 3.
    const local = [{ id: 'p1', name: 'Cola', qty: 8, updatedAt: 100 }];
    const server = [{ id: 'p1', name: 'Cola', qty: 7, updatedAt: 200 }];
    const localMovements = [{ id: 'm1', productId: 'p1', delta: -2, at: 100 }];
    const serverMovements = [{ id: 'm2', productId: 'p1', delta: -3, at: 200 }];
    const out = mergeInventory(local, server, { localMovements, serverMovements });
    const p = out.find((x) => x.id === 'p1');
    expect(p.qty).toBe(5);         // 10 − 2 − 3, not 8 or 7
    expect(p.name).toBe('Cola');
  });

  it('metadata follows the newer updatedAt even while qty comes from the ledger', () => {
    const local = [{ id: 'p1', name: 'Old name', price: 1, qty: 8, updatedAt: 100 }];
    const server = [{ id: 'p1', name: 'New name', price: 2, qty: 7, updatedAt: 200 }];
    const out = mergeInventory(local, server, {
      localMovements: [{ id: 'm1', productId: 'p1', delta: -2 }],
      serverMovements: [{ id: 'm2', productId: 'p1', delta: -3 }],
    });
    const p = out.find((x) => x.id === 'p1');
    expect(p.name).toBe('New name'); // server metadata won (updatedAt 200)
    expect(p.price).toBe(2);
    expect(p.qty).toBe(5);           // but qty is the merged ledger result
  });

  it('falls back to the winner\'s absolute qty when no movement data is available', () => {
    const local = [{ id: 'p1', qty: 8, updatedAt: 100 }];
    const server = [{ id: 'p1', qty: 7, updatedAt: 200 }];
    const out = mergeInventory(local, server, { localMovements: [], serverMovements: [] });
    expect(out.find((x) => x.id === 'p1').qty).toBe(7); // server won; no ledger to reconstruct from
  });

  it('a product only on one side is kept with its own qty', () => {
    const out = mergeInventory([{ id: 'p1', qty: 4, updatedAt: 1 }], [], {
      localMovements: [{ id: 'm1', productId: 'p1', delta: -1 }], serverMovements: [{ id: 'x', productId: 'other', delta: 1 }],
    });
    const p = out.find((x) => x.id === 'p1');
    // opening = 4 − (−1) = 5; merged ledger for p1 = −1 → qty 4 (unchanged, no other device touched it)
    expect(p.qty).toBe(4);
  });

  it('preserves a product tombstone', () => {
    const now = Date.now();
    const out = mergeInventory([tombstone('p1', now)], [{ id: 'p1', qty: 3, updatedAt: now - 1000 }], {
      serverMovements: [{ id: 'm', productId: 'p1', delta: -1 }], now,
    });
    expect(liveItems(out)).toEqual([]);
  });
});

describe('mergeStoreArrays — dispatch', () => {
  it('routes inventory / movements / doc stores to the right strategy', () => {
    expect(mergeStoreArrays('movements_v1', [{ id: 'm1', delta: 1 }], [{ id: 'm2', delta: 1 }]).length).toBe(2);
    expect(mergeStoreArrays('orders_v1', [{ id: 'o1', updatedAt: 2 }], [{ id: 'o1', updatedAt: 1 }])[0].updatedAt).toBe(2);
    const inv = mergeStoreArrays('inventory_v1', [{ id: 'p', qty: 8, updatedAt: 1 }], [{ id: 'p', qty: 7, updatedAt: 2 }], {
      localMovements: [{ id: 'a', productId: 'p', delta: -2 }], serverMovements: [{ id: 'b', productId: 'p', delta: -3 }],
    });
    expect(inv.find((x) => x.id === 'p').qty).toBe(5);
  });

  it('an unknown store returns the server copy unchanged', () => {
    expect(mergeStoreArrays('whatever_v1', [{ id: 'a' }], [{ id: 'b' }])).toEqual([{ id: 'b' }]);
  });
});

describe('external delete tombstones', () => {
  it('mergeTombstones unions by k, keeps the newest at, and GCs old rows', () => {
    const now = Date.now();
    const local = [{ k: 'orders_v1:o1', store: 'orders_v1', id: 'o1', at: now - 1000 }];
    const server = [
      { k: 'orders_v1:o1', store: 'orders_v1', id: 'o1', at: now }, // newer wins
      { k: 'orders_v1:old', store: 'orders_v1', id: 'old', at: now - (TOMBSTONE_TTL_DAYS + 1) * DAY }, // GC
    ];
    const out = mergeTombstones(local, server, { now });
    expect(out.find((t) => t.id === 'o1').at).toBe(now);
    expect(out.some((t) => t.id === 'old')).toBe(false);
  });

  it('applyTombstones drops a deleted item but keeps an edit made AFTER the delete', () => {
    const now = Date.now();
    const items = [
      { id: 'a', updatedAt: now - 2000 }, // deleted after this edit → dropped
      { id: 'b', updatedAt: now },         // edited after the delete → kept (revival)
      { id: 'c', updatedAt: now },         // no tombstone → kept
    ];
    const tombs = [
      { k: 'orders_v1:a', store: 'orders_v1', id: 'a', at: now - 1000 },
      { k: 'orders_v1:b', store: 'orders_v1', id: 'b', at: now - 1000 },
    ];
    const map = tombstoneMap(tombs, 'orders_v1');
    const out = applyTombstones(items, map);
    expect(out.map((x) => x.id).sort()).toEqual(['b', 'c']);
  });

  it('tombstoneMap scopes by store and keeps the newest at per id', () => {
    const map = tombstoneMap([
      { store: 'orders_v1', id: 'a', at: 1 },
      { store: 'orders_v1', id: 'a', at: 5 },
      { store: 'claims_v1', id: 'a', at: 9 },
    ], 'orders_v1');
    expect(map.get('a')).toBe(5);     // newest for orders_v1
    expect(map.size).toBe(1);         // claims_v1 excluded
  });
});
