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
    // F3 commit-before-delete: the stale 'old' is kept until the IndexedDB write COMMITS, THEN removed.
    expect(localStorage.getItem(key)).not.toBeNull();             // still present right after the sync return
    await storage.flushDurable();                                 // let the durable commit land
    expect(localStorage.getItem(key)).toBeNull();                 // now the stale 'old' is dropped
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

  it('F3 r2: a SLOW older overflow commit must not delete a NEWER acknowledged value', async () => {
    const ws = storage.getActiveWorkspace();
    const key = storage.keyFor('inventory_v1', ws);
    const V1 = JSON.stringify([{ id: 'V1' }]);
    const V2 = JSON.stringify([{ id: 'V2' }]);

    // Deferred durable backend: set() parks a resolver so we control WHEN each commit lands.
    const map = new Map();
    const pending = [];
    storage.__setDurableBackend({
      available: () => true,
      getAll: async () => [...map.entries()].map(([k, v]) => ({ key: k, value: v })),
      set: (k, v) => new Promise((resolve, reject) => {
        pending.push({ v, commit: () => { map.set(k, v); resolve(true); }, fail: () => reject(new Error('idb fail')) });
      }),
      del: async (k) => { map.delete(k); return true; },
    });

    // 1) Overflow write of V1 — localStorage rejects THIS key (quota) → op1 is deferred.
    const orig = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function block(k, v) {
      if (k === key) throw new Error('QuotaExceededError');
      return orig.call(this, k, v);
    });
    expect(storage.writeJSON('inventory_v1', [{ id: 'V1' }]).overflow).toBe(true);
    spy.mockRestore();

    // 2) A NEWER normal write of V2 now succeeds into localStorage (and starts its own deferred mirror op2).
    expect(storage.writeJSON('inventory_v1', [{ id: 'V2' }]).ok).toBe(true);
    expect(localStorage.getItem(key)).toBe(V2); // newer value acknowledged in localStorage

    // 3) The SLOW older overflow commit (op1 = set V1) finally lands — it must NOT drop the newer V2.
    pending.find((p) => p.v === V1).commit();
    await tick();
    expect(localStorage.getItem(key)).toBe(V2); // pre-fix: op1 removed it → null → V1 restored at reboot

    // 4) The newer value's durable mirror (op2 = set V2) then FAILS, so IDB only holds V1.
    pending.find((p) => p.v === V2).fail();
    await tick();

    // 5) Reboot: fresh MEM + init. Swap to an auto-resolving backend over the SAME map (IDB still only holds
    // V1) so init's own durable writes don't park. localStorage still has V2, so we recover V2 — not V1.
    storage.__setDurableBackend({
      available: () => true,
      getAll: async () => [...map.entries()].map(([k, v]) => ({ key: k, value: v })),
      set: async (k, v) => { map.set(k, v); return true; },
      del: async (k) => { map.delete(k); return true; },
    });
    storage.__resetMemForTest(); storage.__resetInitForTest();
    await storage.initStorage();
    expect(storage.readJSON('inventory_v1', null)).toEqual([{ id: 'V2' }]);
    expect(map.get(key)).toBe(V1); // IDB never got V2 (its mirror failed) — recovery came from localStorage
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

  it('F3: when the IndexedDB commit rejects, the PREVIOUS localStorage copy is NOT deleted (last-good survives)', async () => {
    const fake = {
      available: () => true,
      getAll: async () => [],
      set: async () => { throw new Error('idb-write-failed'); },
      del: async () => true,
    };
    storage.__setDurableBackend(fake);
    storage.setActiveWorkspace(`shop:f3keep${wsN++}`);
    const key = storage.keyFor('inventory_v1', storage.getActiveWorkspace());
    // Seed a previous value directly into localStorage (the last durable copy on this device).
    localStorage.setItem(key, JSON.stringify([{ id: 'previous' }]));
    storage.__resetMemForTest();
    // Now the replacement write hits quota in localStorage and the durable commit will reject.
    const orig = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function block(k, v) {
      if (k === key) throw new Error('QuotaExceededError');
      return orig.call(this, k, v);
    });
    const res = storage.writeJSON('inventory_v1', [{ id: 'new' }]);
    await storage.flushDurable();
    spy.mockRestore();
    storage.__setDurableBackend(null);
    expect(res.overflow).toBe(true);
    // The durable write failed → the previous localStorage copy must still be there (not both lost).
    expect(localStorage.getItem(key)).toBe(JSON.stringify([{ id: 'previous' }]));
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
