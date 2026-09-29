import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as storage from '../storage';

// A minimal in-memory stand-in for the IndexedDB backend, so we can exercise the durability
// logic in jsdom (which has no IndexedDB) without adding a dependency. Mirrors idb.js's shape.
function makeFakeDurable() {
  const map = new Map();
  return {
    available: () => true,
    getAll: async () => [...map.entries()].map(([key, value]) => ({ key, value })),
    set: async (k, v) => { map.set(k, v); return true; },
    del: async (k) => { map.delete(k); return true; },
    _map: map,
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

let wsN = 0;
let fake;
beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  storage.__resetMemForTest();
  storage.__resetInitForTest();
  fake = makeFakeDurable();
  storage.__setDurableBackend(fake);
  storage.setActiveWorkspace(`shop:idb${wsN++}`);
});
afterEach(() => { storage.__setDurableBackend(null); });

describe('durability — write-through to IndexedDB', () => {
  it('mirrors every write into the durable backend', async () => {
    storage.writeJSON('inventory_v1', [{ id: 'a' }]);
    await tick();
    const ws = storage.getActiveWorkspace();
    expect(fake._map.get(storage.keyFor('inventory_v1', ws))).toBe(JSON.stringify([{ id: 'a' }]));
  });

  it('removeKey deletes from the durable backend too', async () => {
    storage.writeJSON('inventory_v1', [{ id: 'a' }]);
    await tick();
    storage.removeKey('inventory_v1');
    await tick();
    const ws = storage.getActiveWorkspace();
    expect(fake._map.has(storage.keyFor('inventory_v1', ws))).toBe(false);
  });
});

describe('durability — recovery on boot', () => {
  it('restores data present in IndexedDB but missing from localStorage, and refreshes hooks', async () => {
    const ws = storage.getActiveWorkspace();
    const key = storage.keyFor('inventory_v1', ws);
    // Simulate: a previous session persisted to IndexedDB, but localStorage was evicted.
    fake._map.set(key, JSON.stringify([{ id: 'recovered' }]));
    // Nothing in localStorage or MEM yet:
    expect(storage.readJSON('inventory_v1', null)).toBeNull();

    let refreshed = 0;
    const handler = () => { refreshed += 1; };
    window.addEventListener(storage.WORKSPACE_EVENT, handler);
    const res = await storage.initStorage();
    window.removeEventListener(storage.WORKSPACE_EVENT, handler);

    expect(res.ran).toBe(true);
    expect(res.restored).toBe(1);
    expect(storage.readJSON('inventory_v1', null)).toEqual([{ id: 'recovered' }]);
    expect(refreshed).toBeGreaterThanOrEqual(1); // hooks told to re-read
  });

  it('seeds IndexedDB from existing localStorage keys it does not have', async () => {
    const ws = storage.getActiveWorkspace();
    const key = storage.keyFor('inventory_v1', ws);
    // Existing user: data in localStorage, IndexedDB empty (first run with IDB).
    localStorage.setItem(key, JSON.stringify([{ id: 'existing' }]));
    expect(fake._map.has(key)).toBe(false);

    const res = await storage.initStorage();
    await tick();
    expect(res.seeded).toBeGreaterThanOrEqual(1);
    expect(fake._map.get(key)).toBe(JSON.stringify([{ id: 'existing' }]));
  });

  it('does not overwrite newer localStorage data with older IndexedDB data', async () => {
    const ws = storage.getActiveWorkspace();
    const key = storage.keyFor('inventory_v1', ws);
    localStorage.setItem(key, JSON.stringify([{ id: 'fresh' }]));
    fake._map.set(key, JSON.stringify([{ id: 'stale' }]));

    await storage.initStorage();
    expect(storage.readJSON('inventory_v1', null)).toEqual([{ id: 'fresh' }]); // localStorage wins
  });
});

describe('durability — overflow past the localStorage cap', () => {
  it('when localStorage rejects (quota) but IndexedDB is available, the write still succeeds', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
    });
    const errors = [];
    const handler = (e) => errors.push(e.detail);
    window.addEventListener(storage.STORAGE_ERROR_EVENT, handler);

    const res = storage.writeJSON('inventory_v1', [{ id: 'big' }]);
    await tick();

    window.removeEventListener(storage.STORAGE_ERROR_EVENT, handler);
    spy.mockRestore();

    expect(res.ok).toBe(true);
    expect(res.overflow).toBe(true);
    expect(errors.length).toBe(0);                 // no "couldn't save" — it IS saved (in IDB)
    expect(storage.readJSON('inventory_v1', null)).toEqual([{ id: 'big' }]); // readable from MEM
    const ws = storage.getActiveWorkspace();
    expect(fake._map.get(storage.keyFor('inventory_v1', ws))).toBe(JSON.stringify([{ id: 'big' }]));
  });
});

describe('durability — graceful degradation without IndexedDB', () => {
  it('behaves exactly like localStorage-only when the backend is unavailable', async () => {
    storage.__setDurableBackend({ available: () => false });
    storage.writeJSON('inventory_v1', [{ id: 'plain' }]);
    expect(storage.readJSON('inventory_v1', null)).toEqual([{ id: 'plain' }]);
    const res = await storage.initStorage();
    expect(res.ran).toBe(false);
  });

  it('quota failure with no IndexedDB still reports a visible error', () => {
    storage.__setDurableBackend({ available: () => false });
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
    });
    const errors = [];
    const handler = (e) => errors.push(e.detail);
    window.addEventListener(storage.STORAGE_ERROR_EVENT, handler);

    const res = storage.writeJSON('inventory_v1', [{ id: 'x' }]);

    window.removeEventListener(storage.STORAGE_ERROR_EVENT, handler);
    spy.mockRestore();

    expect(res.ok).toBe(false);
    expect(errors.length).toBe(1);
  });
});
