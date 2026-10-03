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

  it('FE3: an overflow write drops the stale localStorage value so the new one wins at restart', async () => {
    const ws = storage.getActiveWorkspace();
    const key = storage.keyFor('inventory_v1', ws);
    storage.writeJSON('inventory_v1', [{ id: 'old' }]); // succeeds into localStorage + durable
    await tick();
    // Now make localStorage reject the replacement (quota), while the durable backend still accepts it.
    const orig = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function block(k, v) {
      if (k === key) throw new Error('QuotaExceededError');
      return orig.call(this, k, v);
    });
    const res = storage.writeJSON('inventory_v1', [{ id: 'new' }]);
    expect(res).toMatchObject({ ok: true, overflow: true });
    expect(localStorage.getItem(key)).toBeNull();                 // stale 'old' removed (FE3)
    expect(fake._map.get(key)).toBe(JSON.stringify([{ id: 'new' }])); // durable holds 'new'
    spy.mockRestore();
    // Simulate restart: fresh MEM + init recovers from durable; must read 'new', not 'old'.
    storage.__resetMemForTest(); storage.__resetInitForTest();
    await storage.initStorage();
    expect(storage.readJSON('inventory_v1', null)).toEqual([{ id: 'new' }]);
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

describe('durability — auth/session keys are never mirrored to IndexedDB (audit F1)', () => {
  it('does not seed vendora:auth into IDB, and purges + never restores a stale IDB copy', async () => {
    // Simulate an earlier build that leaked the session into IDB, plus a logged-out localStorage.
    fake._map.set('vendora:auth', JSON.stringify({ token: 'stale-secret' }));
    try { localStorage.removeItem('vendora:auth'); } catch { /* ignore */ }

    const res = await storage.initStorage();
    // token must NOT come back into localStorage…
    let ls = null; try { ls = localStorage.getItem('vendora:auth'); } catch { /* ignore */ }
    expect(ls).toBeNull();                       // not restored to localStorage
    // …and the stale IDB copy is purged.
    await tick();
    expect(fake._map.has('vendora:auth')).toBe(false);
    expect(res.ran).toBe(true);
  });

  it('a normal write of vendora:auth is not copied to IDB', async () => {
    try { localStorage.setItem('vendora:auth', JSON.stringify({ token: 't' })); } catch { /* ignore */ }
    // seeding pass must skip it
    await storage.initStorage();
    await tick();
    expect(fake._map.has('vendora:auth')).toBe(false);
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

describe('cross-tab coherence (audit F5) — MEM must not shadow a fresh localStorage value', () => {
  it('a change from another tab updates the cache so the next read is fresh', () => {
    storage.writeJSON('inventory_v1', [{ id: 'old' }]);       // this tab: MEM + localStorage = old
    const ws = storage.getActiveWorkspace();
    const key = storage.keyFor('inventory_v1', ws);
    // Another tab writes shared localStorage and the browser fires a `storage` event to us:
    const next = JSON.stringify([{ id: 'new' }]);
    localStorage.setItem(key, next);
    storage.__applyCrossTabStorage({ key, newValue: next });
    expect(storage.readJSON('inventory_v1', null)).toEqual([{ id: 'new' }]); // not the stale MEM value
  });

  it('a delete from another tab clears the cached value', () => {
    storage.writeJSON('inventory_v1', [{ id: 'x' }]);
    const ws = storage.getActiveWorkspace();
    const key = storage.keyFor('inventory_v1', ws);
    localStorage.removeItem(key);
    storage.__applyCrossTabStorage({ key, newValue: null });
    expect(storage.readJSON('inventory_v1', null)).toBeNull();
  });
});

describe('durability on unload (audit F3) — flushDurable awaits in-flight commits', () => {
  it('flushDurable resolves only after a slow durable write has committed', async () => {
    const map = new Map();
    storage.__setDurableBackend({
      available: () => true,
      getAll: async () => [...map.entries()].map(([key, value]) => ({ key, value })),
      set: (k, v) => new Promise((r) => setTimeout(() => { map.set(k, v); r(true); }, 20)),
      del: async (k) => { map.delete(k); return true; },
    });
    storage.setActiveWorkspace(`shop:flush${wsN++}`);
    storage.writeJSON('inventory_v1', [{ id: 'pending' }]);
    const ws = storage.getActiveWorkspace();
    const key = storage.keyFor('inventory_v1', ws);
    expect(map.has(key)).toBe(false);        // async commit not done yet
    await storage.flushDurable();
    expect(map.has(key)).toBe(true);         // flush waited for it
  });
});

describe('overflow durable write (audit F3/F4) — a failed sole-copy commit is surfaced', () => {
  it('when localStorage is full AND the IndexedDB commit rejects, a visible error fires', async () => {
    storage.__setDurableBackend({
      available: () => true,
      getAll: async () => [],
      set: async () => { throw new Error('idb-write-failed'); },
      del: async () => true,
    });
    storage.setActiveWorkspace(`shop:crit${wsN++}`);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
    });
    const errors = [];
    const handler = (e) => errors.push(e.detail);
    window.addEventListener(storage.STORAGE_ERROR_EVENT, handler);

    const res = storage.writeJSON('inventory_v1', [{ id: 'big' }]);
    await storage.flushDurable();

    window.removeEventListener(storage.STORAGE_ERROR_EVENT, handler);
    spy.mockRestore();

    expect(res.overflow).toBe(true);         // optimistic sync return (IDB was available)
    expect(errors.length).toBe(1);           // …but the async commit failed, so it's surfaced
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
