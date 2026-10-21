import { describe, it, expect } from 'vitest';
import { mergeInventory } from '../mergeStore';
import { movementHistory, reconcileQty } from '../movementStore';

const NOW = Date.now();

// Audit P1: a history-only CSV sale is recorded as an EVIDENCE-only SALE movement. It must count for velocity
// but NEVER reduce stock — including when a sync merge reconstructs quantity from the combined ledger on a
// device that didn't have that movement.
describe('merge — evidence-only sales never change stock', () => {
  const local = [{ id: 'p1', qty: 10, name: 'Cola', updatedAt: 100 }];
  // Server has a newer product name (so the server copy wins the metadata merge) but no corresponding movement.
  const server = [{ id: 'p1', qty: 10, name: 'Cola Zero', updatedAt: 200 }];

  it('reproduces the audit scenario: stock stays 10, not 8', () => {
    const evidenceSale = { id: 'm1', productId: 'p1', type: 'sale', delta: -2, at: NOW, evidence: true };
    const out = mergeInventory(local, server, {
      localMovements: [evidenceSale],
      serverMovements: [],
      movementsAvailable: true,
      now: NOW,
    });
    const p1 = out.find((p) => p.id === 'p1');
    expect(p1.qty).toBe(10);          // evidence excluded from reconstruction
    expect(p1.name).toBe('Cola Zero'); // metadata merge unaffected (server newer)
  });

  it('a REAL (non-evidence) sale still deducts on merge', () => {
    const realSale = { id: 'm2', productId: 'p1', type: 'sale', delta: -2, at: NOW }; // no evidence flag
    const out = mergeInventory(local, server, {
      localMovements: [realSale],
      serverMovements: [],
      movementsAvailable: true,
      now: NOW,
    });
    expect(out.find((p) => p.id === 'p1').qty).toBe(8); // stock-affecting → still reconstructs to 8
  });

  it('other merge direction: local wins metadata, evidence still ignored for qty', () => {
    const localNewer = [{ id: 'p1', qty: 10, name: 'Cola', updatedAt: 300 }];
    const evidenceSale = { id: 'm3', productId: 'p1', type: 'sale', delta: -5, at: NOW, evidence: true };
    const out = mergeInventory(localNewer, server, {
      localMovements: [evidenceSale],
      serverMovements: [],
      movementsAvailable: true,
      now: NOW,
    });
    expect(out.find((p) => p.id === 'p1').qty).toBe(10);
  });
});

describe('movementStore — evidence excluded from quantity derivations', () => {
  it('running balance ignores evidence rows but still lists them', () => {
    const recs = [
      { id: 'a', productId: 'p1', type: 'goods_received', delta: 10, at: NOW - 3000 },
      { id: 'b', productId: 'p1', type: 'sale', delta: -2, at: NOW - 2000, evidence: true }, // evidence
      { id: 'c', productId: 'p1', type: 'sale', delta: -3, at: NOW - 1000 },                 // real
    ];
    const hist = movementHistory(recs, 'p1', { newestFirst: false, opening: 0 });
    expect(hist.map((r) => r.balance)).toEqual([10, 10, 7]); // evidence row leaves balance unchanged
    expect(hist.length).toBe(3); // still shown
  });

  it('reconcileQty ignores evidence rows', () => {
    const recs = [
      { id: 'a', productId: 'p1', type: 'sale', delta: -2, evidence: true },
      { id: 'b', productId: 'p1', type: 'sale', delta: -3 },
    ];
    expect(reconcileQty(recs, 'p1', 7).ledgerSum).toBe(-3); // only the real sale counts
  });
});
