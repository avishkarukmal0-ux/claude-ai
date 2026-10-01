import { describe, it, expect, vi } from 'vitest';
import * as storage from '../storage';

describe('storage — workspace scoping', () => {
  it('scopes keys per workspace so shops do not collide', () => {
    storage.setActiveWorkspace('shop:A');
    storage.writeJSON('inventory_v1', [{ id: 'a' }]);
    storage.setActiveWorkspace('shop:B');
    storage.writeJSON('inventory_v1', [{ id: 'b' }]);

    storage.setActiveWorkspace('shop:A');
    expect(storage.readJSON('inventory_v1', [])).toEqual([{ id: 'a' }]);
    storage.setActiveWorkspace('shop:B');
    expect(storage.readJSON('inventory_v1', [])).toEqual([{ id: 'b' }]);
  });

  it('uses distinct underlying keys', () => {
    expect(storage.keyFor('inventory_v1', 'shop:A')).toBe('vendora:shop:A:inventory_v1');
    expect(storage.keyFor('inventory_v1', 'local')).toBe('vendora:local:inventory_v1');
  });
});

describe('storage — purgeWorkspace (shared-device safety)', () => {
  it('removes every key of the named workspace from localStorage + memory, leaving others intact', () => {
    storage.__resetMemForTest();
    storage.setActiveWorkspace('shop:A');
    storage.writeJSON('inventory_v1', [{ id: 'a' }]);
    storage.writeJSON('suppliers_v1', [{ id: 's' }]);
    storage.writeJSON('invoice_files_v1', [{ id: 'f' }]); // local-only store is purged too
    storage.setActiveWorkspace('shop:B');
    storage.writeJSON('inventory_v1', [{ id: 'b' }]);

    const res = storage.purgeWorkspace('shop:A');
    expect(res.purged).toBeGreaterThanOrEqual(3);

    // A is gone from both the raw store and the cache
    expect(storage.readJSON('inventory_v1', null, 'shop:A')).toBeNull();
    expect(storage.readJSON('suppliers_v1', null, 'shop:A')).toBeNull();
    expect(storage.readJSON('invoice_files_v1', null, 'shop:A')).toBeNull();
    expect(localStorage.getItem('vendora:shop:A:inventory_v1')).toBeNull();
    // B is untouched
    expect(storage.readJSON('inventory_v1', null, 'shop:B')).toEqual([{ id: 'b' }]);
  });

  it('is a safe no-op for a falsy workspace', () => {
    expect(storage.purgeWorkspace()).toEqual({ purged: 0 });
  });
});

describe('storage — visible write failures', () => {
  it('emits an error event and returns { ok:false } when the device rejects the write', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
    });
    const events = [];
    const handler = (e) => events.push(e.detail);
    window.addEventListener(storage.STORAGE_ERROR_EVENT, handler);

    const res = storage.writeJSON('inventory_v1', [{ id: 'x' }]);

    window.removeEventListener(storage.STORAGE_ERROR_EVENT, handler);
    spy.mockRestore();

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/storage/i);
    expect(events.length).toBe(1);
    expect(events[0].name).toBe('inventory_v1');
  });
});

describe('storage — legacy migration', () => {
  it('copies legacy unscoped keys into the guest workspace once, non-destructively', () => {
    localStorage.setItem('vendora_inventory_v1', JSON.stringify([{ id: 'legacy' }]));
    localStorage.setItem('vendora_shop_type', 'grocery-age:convenience');

    const first = storage.migrateLegacyToLocalOnce();
    expect(first.ran).toBe(true);
    expect(first.migrated).toBe(2);

    // scoped local copy exists
    storage.setActiveWorkspace('local');
    expect(storage.readJSON('inventory_v1', [])).toEqual([{ id: 'legacy' }]);
    // originals retained (non-destructive)
    expect(localStorage.getItem('vendora_inventory_v1')).not.toBeNull();

    // does not run twice
    const second = storage.migrateLegacyToLocalOnce();
    expect(second.ran).toBe(false);
    expect(second.migrated).toBe(0);
  });

  it('does not clobber existing scoped data during migration', () => {
    storage.setActiveWorkspace('local');
    storage.writeJSON('inventory_v1', [{ id: 'already-here' }]);
    localStorage.setItem('vendora_inventory_v1', JSON.stringify([{ id: 'legacy' }]));

    storage.migrateLegacyToLocalOnce();
    expect(storage.readJSON('inventory_v1', [])).toEqual([{ id: 'already-here' }]);
  });
});

describe('storage — explicit workspace assignment', () => {
  it('copyWorkspace never overwrites destination data by default (no silent attach)', () => {
    storage.writeJSON('inventory_v1', [{ id: 'guest' }], /* ws */ undefined);
    // put guest data in 'local'
    storage.setActiveWorkspace('local');
    storage.writeJSON('inventory_v1', [{ id: 'guest' }]);
    // shop already has its own data
    storage.writeJSON('inventory_v1', [{ id: 'shopdata' }], 'shop:Z');

    const report = storage.copyWorkspace('local', 'shop:Z');
    expect(report.skipped).toBeGreaterThanOrEqual(1);
    expect(storage.readJSON('inventory_v1', [], 'shop:Z')).toEqual([{ id: 'shopdata' }]);
  });

  it('copyWorkspace copies into an empty destination', () => {
    storage.setActiveWorkspace('local');
    storage.writeJSON('inventory_v1', [{ id: 'guest' }]);
    const report = storage.copyWorkspace('local', 'shop:new');
    expect(report.copied).toBeGreaterThanOrEqual(1);
    expect(storage.readJSON('inventory_v1', [], 'shop:new')).toEqual([{ id: 'guest' }]);
  });
});
