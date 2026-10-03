import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as storage from '../storage';
import * as sync from '../sync';
import { listConflicts } from '../conflictBackup';

// A fake sync server that mirrors pwaSyncService.js semantics (rev + last-write-wins by mtime), driven
// through the pluggable transport. Lets us exercise the whole client reconcile loop in jsdom.
function makeFakeServer() {
  const blobs = new Map(); // name -> { value, rev, mtime }
  return {
    blobs,
    transport: async (path, { method = 'GET', body } = {}) => {
      if (path === '/pull') {
        return { success: true, blobs: [...blobs.entries()].map(([name, b]) => ({ name, ...b })) };
      }
      if (path === '/push') {
        const applied = [];
        const conflicts = [];
        for (const c of (body && body.changes) || []) {
          const ex = blobs.get(c.name);
          if (!ex) { blobs.set(c.name, { value: c.value, rev: 1, mtime: c.mtime }); applied.push({ name: c.name, rev: 1 }); }
          else if (ex.rev === c.baseRev || c.mtime > ex.mtime) {
            const rev = ex.rev + 1; blobs.set(c.name, { value: c.value, rev, mtime: c.mtime }); applied.push({ name: c.name, rev });
          } else {
            conflicts.push({ name: c.name, value: ex.value, rev: ex.rev, mtime: ex.mtime });
          }
        }
        return { success: true, applied, conflicts };
      }
      throw new Error(`unexpected path ${path}`);
    },
  };
}

let wsN = 0;
let server;
let ws;
beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  storage.__resetMemForTest();
  storage.__setDurableBackend({ available: () => false }); // localStorage-only for determinism
  sync.__resetSyncForTest();
  ws = `shop:sync${wsN++}`;
  storage.setActiveWorkspace(ws);
  // A signed-in session (sync reads currentSession() from this key).
  localStorage.setItem('vendora:auth', JSON.stringify({ token: 't', refreshToken: 'r', shop: { id: ws.slice(5), name: 'S' } }));
  server = makeFakeServer();
  sync.__setSyncTransport(server.transport);
});
afterEach(() => { sync.__setSyncTransport(null); storage.__setDurableBackend(null); sync.__resetSyncForTest(); });

describe('sync — bootstrap (first sync on a device)', () => {
  it('adopts the shop\'s existing cloud data instead of clobbering it', async () => {
    server.blobs.set('inventory_v1', { value: JSON.stringify([{ id: 'cloud' }]), rev: 4, mtime: 5000 });
    // This device happens to have different local data, but has never synced this shop.
    storage.writeJSON('inventory_v1', [{ id: 'local-stale' }], ws);

    const res = await sync.syncNow();
    expect(res.ok).toBe(true);
    expect(storage.readJSON('inventory_v1', null, ws)).toEqual([{ id: 'cloud' }]); // server won
  });

  it('uploads a purely-local store the server does not have', async () => {
    storage.writeJSON('tasks_v1', [{ id: 'only-here' }], ws);
    const res = await sync.syncNow();
    expect(res.ok).toBe(true);
    expect(server.blobs.get('tasks_v1')).toMatchObject({ value: JSON.stringify([{ id: 'only-here' }]), rev: 1 });
  });
});

describe('sync — ongoing (after bootstrap)', () => {
  async function bootstrap() { await sync.syncNow(); } // marks meta.__boot

  it('pushes a local edit to the server', async () => {
    await bootstrap();
    storage.writeJSON('inventory_v1', [{ id: 'a', qty: 2 }], ws);
    sync.markStoreDirty('inventory_v1', 10000);       // simulate the write listener
    const res = await sync.syncNow();
    expect(res.ok).toBe(true);
    expect(server.blobs.get('inventory_v1')).toMatchObject({ value: JSON.stringify([{ id: 'a', qty: 2 }]), rev: 1 });
  });

  it('pulls a newer server revision made on another device', async () => {
    await bootstrap();
    // Another device pushed while we were idle.
    server.blobs.set('suppliers_v1', { value: JSON.stringify([{ id: 'sup' }]), rev: 9, mtime: 20000 });
    const res = await sync.syncNow();
    expect(res.ok).toBe(true);
    expect(storage.readJSON('suppliers_v1', null, ws)).toEqual([{ id: 'sup' }]);
  });

  it('a stale local edit loses to a newer server copy (adopts server on conflict)', async () => {
    await bootstrap();
    // Server already advanced past our known rev, with a NEWER mtime than our pending edit.
    server.blobs.set('waste_v1', { value: JSON.stringify([{ id: 'server-win' }]), rev: 3, mtime: 99999 });
    storage.writeJSON('waste_v1', [{ id: 'local-old' }], ws);
    sync.markStoreDirty('waste_v1', 100);             // older than the server's mtime
    const res = await sync.syncNow();
    expect(res.ok).toBe(true);
    expect(storage.readJSON('waste_v1', null, ws)).toEqual([{ id: 'server-win' }]); // server won
  });
});

describe('sync — concurrency hardening (audit 2026-10-01)', () => {
  it('keeps an edit made while a push is in flight (not marked clean/overwritten)', async () => {
    await sync.syncNow(); // bootstrap
    storage.writeJSON('inventory_v1', [{ v: 1 }], ws);
    sync.markStoreDirty('inventory_v1', 100);

    let injected = false;
    sync.__setSyncTransport(async (path, opts) => {
      if (path === '/push' && !injected) {
        injected = true;
        // a newer local edit lands WHILE the push (carrying v1) is in flight
        storage.writeJSON('inventory_v1', [{ v: 2 }], ws);
        sync.markStoreDirty('inventory_v1', 200);
      }
      return server.transport(path, opts);
    });

    const res = await sync.syncNow();
    expect(res.ok).toBe(true);
    expect(storage.readJSON('inventory_v1', null, ws)).toEqual([{ v: 2 }]); // v2 preserved, not clobbered
    expect(sync.getSyncState().pending).toBeGreaterThanOrEqual(1);          // still dirty → will re-push
  });

  it('aborts without uploading when the account is switched mid-sync (no cross-account leak)', async () => {
    localStorage.setItem('vendora:auth', JSON.stringify({ token: 'tA', refreshToken: 'rA', shop: { id: 'A', name: 'A' } }));
    storage.setActiveWorkspace('shop:A');
    await sync.syncNow(); // bootstrap A
    storage.writeJSON('tasks_v1', [{ secret: 'A' }], 'shop:A');
    sync.markStoreDirty('tasks_v1', 100);

    let switched = false;
    sync.__setSyncTransport(async (path, opts) => {
      if (!switched) {
        switched = true; // account switches to B during the first request
        localStorage.setItem('vendora:auth', JSON.stringify({ token: 'tB', refreshToken: 'rB', shop: { id: 'B', name: 'B' } }));
        storage.setActiveWorkspace('shop:B');
      }
      return server.transport(path, opts);
    });

    const res = await sync.syncNow();
    expect(res.aborted).toBe(true);
    expect(server.blobs.has('tasks_v1')).toBe(false); // A's secret never pushed under B's token
  });

  it('propagates a cleared store so it does not resurrect on other devices', async () => {
    await sync.syncNow(); // bootstrap
    storage.writeJSON('tasks_v1', [{ id: 't1' }], ws);
    sync.markStoreDirty('tasks_v1', 100);
    await sync.syncNow(); // tasks now on server at rev1
    expect(server.blobs.get('tasks_v1').value).toBe(JSON.stringify([{ id: 't1' }]));

    storage.removeKey('tasks_v1', ws);
    sync.markStoreDirty('tasks_v1', 200); // simulate the write-event marking it dirty
    await sync.syncNow();
    expect(server.blobs.get('tasks_v1').value).toBe(''); // cleared propagated as empty
  });
});

describe('sync — conflict recovery (Phase 1.1g: no silent loss)', () => {
  it('keeps a recovery copy when a newer server change replaces a dirty local edit (pull path)', async () => {
    await sync.syncNow(); // bootstrap
    server.blobs.set('waste_v1', { value: JSON.stringify([{ id: 'server-win' }]), rev: 3, mtime: 99999 });
    storage.writeJSON('waste_v1', [{ id: 'my-unsynced' }], ws);
    sync.markStoreDirty('waste_v1', 100); // older than the server's copy → server wins

    let fired = 0;
    const on = () => { fired += 1; };
    window.addEventListener(sync.CONFLICT_EVENT, on);
    const res = await sync.syncNow();
    window.removeEventListener(sync.CONFLICT_EVENT, on);

    expect(res.ok).toBe(true);
    expect(storage.readJSON('waste_v1', null, ws)).toEqual([{ id: 'server-win' }]); // server won
    const kept = listConflicts(ws).find((k) => k.name === 'waste_v1');
    expect(kept && kept.value).toBe(JSON.stringify([{ id: 'my-unsynced' }])); // our copy preserved
    expect(sync.getSyncState().conflicts).toBeGreaterThanOrEqual(1);
    expect(fired).toBe(1); // user was told
  });

  it('stashes the losing local value on a push conflict (another device pushed first)', async () => {
    await sync.syncNow(); // bootstrap (empty)
    storage.writeJSON('orders_v1', [{ id: 'mine' }], ws);
    sync.markStoreDirty('orders_v1', 100);
    // A different device creates orders_v1 with a newer mtime AFTER our pull but BEFORE our push.
    sync.__setSyncTransport(async (path, opts) => {
      if (path === '/push' && !server.blobs.has('orders_v1')) {
        server.blobs.set('orders_v1', { value: JSON.stringify([{ id: 'theirs' }]), rev: 5, mtime: 9999 });
      }
      return server.transport(path, opts);
    });

    const res = await sync.syncNow();
    expect(res.ok).toBe(true);
    expect(storage.readJSON('orders_v1', null, ws)).toEqual([{ id: 'theirs' }]); // server won
    expect(listConflicts(ws).some((k) => k.name === 'orders_v1' && k.value === JSON.stringify([{ id: 'mine' }]))).toBe(true);
  });
});

describe('sync — guards', () => {
  it('does nothing without a session', async () => {
    localStorage.removeItem('vendora:auth');
    const res = await sync.syncNow();
    expect(res.skipped).toBe(true);
  });

  it('does nothing in the guest workspace (no account)', async () => {
    storage.setActiveWorkspace(storage.LOCAL_WORKSPACE);
    const res = await sync.syncNow();
    expect(res.skipped).toBe(true);
  });
});
