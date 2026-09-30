import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as storage from '../storage';
import * as sync from '../sync';

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
