import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildBackup, readBackup, restoreBackup, restoreFromText } from '../backup';
import { writeJSON, readJSON, keyFor, setActiveWorkspace } from '../storage';

let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:bkp${ws++}`); });

describe('backup — validation (finding 2F)', () => {
  it('rejects non-JSON, wrong app, and newer-version backups', () => {
    expect(readBackup('not json').ok).toBe(false);
    expect(readBackup(JSON.stringify({ app: 'other', data: {} })).ok).toBe(false);
    expect(readBackup(JSON.stringify({ app: 'vendora', version: 999, data: { inventory_v1: '[]' } })).ok).toBe(false);
  });

  it('accepts a v2 backup and ignores unrelated keys', () => {
    const parsed = readBackup(JSON.stringify({
      app: 'vendora', version: 2, data: { inventory_v1: '[{"id":"a"}]', not_a_store: 'x' },
    }));
    expect(parsed.ok).toBe(true);
    expect(parsed.data.inventory_v1).toBeDefined();
    expect(parsed.data.not_a_store).toBeUndefined();
  });

  it('accepts a legacy v1 backup and maps raw keys to logical names', () => {
    const parsed = readBackup(JSON.stringify({
      app: 'vendora', version: 1, data: { vendora_inventory_v1: '[{"id":"legacy"}]' },
    }));
    expect(parsed.ok).toBe(true);
    expect(parsed.data.inventory_v1).toBe('[{"id":"legacy"}]');
  });
});

describe('backup — replace clears our data but never unrelated keys', () => {
  it('replace removes our store keys absent from the backup, keeps unrelated keys', () => {
    writeJSON('inventory_v1', [{ id: 'old' }]);
    writeJSON('suppliers_v1', [{ id: 'sup' }]);
    // an unrelated key (e.g. an auth token) in the same workspace namespace
    const tokenKey = 'vendora:auth:token';
    localStorage.setItem(tokenKey, 'secret');

    const parsed = readBackup(JSON.stringify({ app: 'vendora', version: 2, data: { inventory_v1: '[{"id":"new"}]' } }));
    const res = restoreBackup(parsed.data, { mode: 'replace' });

    expect(res.ok).toBe(true);
    expect(readJSON('inventory_v1', [])).toEqual([{ id: 'new' }]);   // replaced
    expect(readJSON('suppliers_v1', null)).toBeNull();               // cleared (not in backup)
    expect(localStorage.getItem(tokenKey)).toBe('secret');           // unrelated key untouched
  });

  it('merge keeps existing store keys not present in the backup', () => {
    writeJSON('suppliers_v1', [{ id: 'sup' }]);
    const parsed = readBackup(JSON.stringify({ app: 'vendora', version: 2, data: { inventory_v1: '[1]' } }));
    restoreBackup(parsed.data, { mode: 'merge' });
    expect(readJSON('suppliers_v1', [])).toEqual([{ id: 'sup' }]);
  });
});

describe('backup — atomic with rollback', () => {
  it('rolls back and reports failure on a mid-restore write error (no partial success)', () => {
    writeJSON('shop_type', 'grocery-age:convenience');
    const original = readJSON('shop_type', null);

    // Fail the SECOND setItem call, succeed otherwise (so rollback can write back).
    const real = Storage.prototype.setItem;
    let n = 0;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
      n += 1;
      if (n === 2) throw new Error('device full mid-write');
      return real.call(this, k, v);
    });

    const res = restoreBackup(
      { shop_type: 'x:y', inventory_v1: '[{"id":"z"}]', suppliers_v1: '[]' },
      { mode: 'replace' },
    );
    spy.mockRestore();

    expect(res.ok).toBe(false);
    // shop_type restored to its original value, not left half-written
    expect(readJSON('shop_type', null)).toBe(original);
  });

  it('restoreFromText round-trips a freshly built backup', () => {
    writeJSON('inventory_v1', [{ id: 'keep' }]);
    const text = JSON.stringify(buildBackup());
    writeJSON('inventory_v1', [{ id: 'changed' }]);
    const res = restoreFromText(text);
    expect(res.ok).toBe(true);
    expect(readJSON('inventory_v1', [])).toEqual([{ id: 'keep' }]);
  });
});

describe('backup — corrupt stores rejected (audit W17)', () => {
  it('readBackup rejects a backup whose known store is not valid JSON', () => {
    const file = JSON.stringify({ app: 'vendora', version: 2, data: { inventory_v1: 'not json' } });
    const res = readBackup(file);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/corrupt/i);
  });

  it('readBackup accepts a valid backup', () => {
    const file = JSON.stringify({ app: 'vendora', version: 2, data: { inventory_v1: '[{"id":"a"}]' } });
    const res = readBackup(file);
    expect(res.ok).toBe(true);
    expect(res.data.inventory_v1).toBe('[{"id":"a"}]');
  });
});
