import { describe, it, expect, beforeEach } from 'vitest';
import { recordRecovery, hasRecovery, clearRecovery, listRecovery } from '../recoveryGuard';
import { setActiveWorkspace, __resetMemForTest } from '../storage';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace('shop:recov');
});

describe('recoveryGuard — durable needs-recovery block (R3/R4)', () => {
  it('records and reports a block by opKey', () => {
    expect(hasRecovery('delivery:op1')).toBe(false);
    recordRecovery('delivery:op1', { kind: 'delivery' });
    expect(hasRecovery('delivery:op1')).toBe(true);
    expect(hasRecovery('delivery:op2')).toBe(false); // independent per operation
  });

  it('SURVIVES a reload — the whole point vs round-2 component state', () => {
    recordRecovery('product:p9', { kind: 'waste' });
    // Simulate an app reload: drop the in-memory cache; a fresh read must rehydrate from durable storage.
    __resetMemForTest();
    expect(hasRecovery('product:p9')).toBe(true); // component state would have reset to false here
  });

  it('clears only after an explicit acknowledgement', () => {
    recordRecovery('stocktake', { kind: 'count' });
    expect(hasRecovery('stocktake')).toBe(true);
    clearRecovery('stocktake');
    __resetMemForTest();
    expect(hasRecovery('stocktake')).toBe(false); // stays cleared across reload
  });

  it('is workspace-scoped — one shop’s recovery flag never blocks another', () => {
    recordRecovery('delivery:opX', { kind: 'delivery' });
    setActiveWorkspace('shop:other');
    expect(hasRecovery('delivery:opX')).toBe(false);
    setActiveWorkspace('shop:recov');
    expect(hasRecovery('delivery:opX')).toBe(true);
  });

  it('listRecovery enumerates current blocks', () => {
    recordRecovery('delivery:a', { kind: 'delivery' });
    recordRecovery('product:b', { kind: 'waste' });
    const keys = listRecovery().map((r) => r.opKey).sort();
    expect(keys).toEqual(['delivery:a', 'product:b']);
  });
});
