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

  it('merges (does not clobber) local on a push conflict for a merge store — nothing is lost', async () => {
    await sync.syncNow(); // bootstrap (empty)
    storage.writeJSON('orders_v1', [{ id: 'mine' }], ws);
    sync.markStoreDirty('orders_v1', 100);
    // A different device creates orders_v1 AFTER our pull but BEFORE our push.
    sync.__setSyncTransport(async (path, opts) => {
      if (path === '/push' && !server.blobs.has('orders_v1')) {
        server.blobs.set('orders_v1', { value: JSON.stringify([{ id: 'theirs' }]), rev: 5, mtime: 9999 });
      }
      return server.transport(path, opts);
    });

    const res = await sync.syncNow();
    expect(res.ok).toBe(true);
    // Per-item merge on conflict: BOTH orders survive (plain adopt would have dropped 'mine').
    const ids = storage.readJSON('orders_v1', [], ws).map((o) => o.id).sort();
    expect(ids).toEqual(['mine', 'theirs']);
    // A recovery copy of the pre-merge local is still kept as a safety net.
    expect(listConflicts(ws).some((k) => k.name === 'orders_v1')).toBe(true);
  });

  it('T1: keeps a NEWER local edit made while a push is in flight (not the stale sent value)', async () => {
    await sync.syncNow(); // bootstrap
    storage.writeJSON('inventory_v1', [{ id: 'milk', qty: 10, updatedAt: 1000 }], ws);
    sync.markStoreDirty('inventory_v1', 1000);
    sync.__setSyncTransport(async (path, opts) => {
      if (path === '/push') {
        // The owner edits milk to 9 (NEWER) WHILE the push carrying 10 is in flight…
        storage.writeJSON('inventory_v1', [{ id: 'milk', qty: 9, updatedAt: 3000 }], ws);
        sync.markStoreDirty('inventory_v1', 3000);
        // …and the server has meanwhile moved to 12 (older than the 9 edit) → conflict.
        server.blobs.set('inventory_v1', { value: JSON.stringify([{ id: 'milk', qty: 12, updatedAt: 2000 }]), rev: 5, mtime: 2000 });
      }
      return server.transport(path, opts);
    });
    const res = await sync.syncNow();
    expect(res.ok).toBe(true);
    const milk = storage.readJSON('inventory_v1', [], ws).find((p) => p.id === 'milk');
    expect(milk.qty).toBe(9); // the newer edit survives — NOT lost to the stale sent 10 or the server's 12
  });

  it('T2: an oversized store rejected by the server stays unsynced (never a false green)', async () => {
    await sync.syncNow(); // bootstrap
    storage.writeJSON('waste_v1', [{ id: 'x' }], ws);
    sync.markStoreDirty('waste_v1', 100);
    sync.__setSyncTransport(async (path, opts) => {
      if (path === '/push') return { success: true, applied: [], conflicts: [], rejected: [{ name: 'waste_v1', reason: 'too_large' }] };
      return server.transport(path, opts);
    });
    const res = await sync.syncNow();
    expect(res.ok).toBe(false);
    expect(res.tooLarge).toBeGreaterThanOrEqual(1);
    expect(sync.getSyncState().pending).toBeGreaterThanOrEqual(1);          // still pending, not synced
    expect(storage.readJSON('waste_v1', null, ws)).toEqual([{ id: 'x' }]);  // local data preserved
  });

  it('T2: a forbidden store is cleared so sync stops retrying a write the role can never make', async () => {
    await sync.syncNow(); // bootstrap
    storage.writeJSON('takings_v1', [{ id: 't' }], ws);
    sync.markStoreDirty('takings_v1', 100);
    sync.__setSyncTransport(async (path, opts) => {
      if (path === '/push') return { success: true, applied: [], conflicts: [], rejected: [{ name: 'takings_v1', reason: 'forbidden' }] };
      return server.transport(path, opts);
    });
    const res = await sync.syncNow();
    expect(res.ok).toBe(true);                       // not an error — the role simply can't write it
    expect(sync.getSyncState().pending).toBe(0);     // dirty cleared → not retried forever
  });
});

describe('sync — per-item merge (item #3)', () => {
  async function bootstrap() { await sync.syncNow(); }

  it('unions items by id instead of clobbering — the other device\'s order survives', async () => {
    await bootstrap();
    // This device holds order A; another device created order B (server has only B, at a higher rev).
    storage.writeJSON('orders_v1', [{ id: 'A', updatedAt: 100 }], ws);
    server.blobs.set('orders_v1', { value: JSON.stringify([{ id: 'B', updatedAt: 200 }]), rev: 2, mtime: 200 });
    const res = await sync.syncNow();
    expect(res.ok).toBe(true);
    const ids = (storage.readJSON('orders_v1', [], ws)).map((o) => o.id).sort();
    expect(ids).toEqual(['A', 'B']); // both kept — plain last-write-wins would have dropped A
  });

  it('rebuilds stock qty from BOTH devices\' movement ledgers, not last-write-wins', async () => {
    await bootstrap();
    // Both started at qty 10 (opening 10). This device sold 2; the other sold 3. Use recent movement
    // timestamps so they fall inside the ledger window (movements older than ~180d are excluded).
    const t = Date.now();
    storage.writeJSON('inventory_v1', [{ id: 'p1', name: 'Cola', qty: 8, updatedAt: t - 2000 }], ws);
    storage.writeJSON('movements_v1', [{ id: 'm1', productId: 'p1', delta: -2, at: t - 2000, type: 'sale' }], ws);
    server.blobs.set('inventory_v1', { value: JSON.stringify([{ id: 'p1', name: 'Cola', qty: 7, updatedAt: t - 1000 }]), rev: 2, mtime: t - 1000 });
    server.blobs.set('movements_v1', { value: JSON.stringify([{ id: 'm2', productId: 'p1', delta: -3, at: t - 1000, type: 'sale' }]), rev: 2, mtime: t - 1000 });
    await sync.syncNow();
    const p = (storage.readJSON('inventory_v1', [], ws)).find((x) => x.id === 'p1');
    expect(p.qty).toBe(5); // 10 − 2 − 3, not 8 or 7
    const movementIds = (storage.readJSON('movements_v1', [], ws)).map((m) => m.id).sort();
    expect(movementIds).toEqual(['m1', 'm2']); // both ledgers unioned
  });

  it('does not resurrect an item deleted on this device (tombstone wins over the server\'s live copy)', async () => {
    await bootstrap();
    // Order X was deleted here (gone locally + a tombstone recorded); the server still has X live.
    storage.writeJSON('orders_v1', [], ws);
    storage.writeJSON('sync_tombstones_v1', [{ k: 'orders_v1:X', store: 'orders_v1', id: 'X', at: Date.now() }], ws);
    server.blobs.set('orders_v1', { value: JSON.stringify([{ id: 'X', updatedAt: Date.now() - 100000 }]), rev: 2, mtime: 100 });
    await sync.syncNow();
    expect(storage.readJSON('orders_v1', [], ws)).toEqual([]); // stayed deleted
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
