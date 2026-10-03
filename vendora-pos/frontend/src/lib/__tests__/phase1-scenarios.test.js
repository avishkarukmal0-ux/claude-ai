import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as storage from '../storage';
import * as sync from '../sync';
import * as account from '../account';

// Phase 1 reliability acceptance scenarios, exercised against the REAL sync engine + a fake server that
// mirrors the backend (rev + last-write-wins). Complements sync.test.js (two-device conflict recovery),
// movements/inventory/batches (retry idempotency + reversal keeps history), account/storage (shared-device
// purge), and backup.test.js (interrupted restore rolls back).
function makeFakeServer() {
  const blobs = new Map();
  return {
    blobs,
    transport: async (path, { method = 'GET', body } = {}) => {
      if (path === '/pull') return { success: true, blobs: [...blobs.entries()].map(([name, b]) => ({ name, ...b })) };
      if (path === '/push') {
        const applied = []; const conflicts = [];
        for (const c of (body && body.changes) || []) {
          const ex = blobs.get(c.name);
          if (!ex) { blobs.set(c.name, { value: c.value, rev: 1, mtime: c.mtime }); applied.push({ name: c.name, rev: 1 }); }
          else if (ex.rev === c.baseRev || c.mtime > ex.mtime) { const rev = ex.rev + 1; blobs.set(c.name, { value: c.value, rev, mtime: c.mtime }); applied.push({ name: c.name, rev }); }
          else conflicts.push({ name: c.name, value: ex.value, rev: ex.rev, mtime: ex.mtime });
        }
        return { success: true, applied, conflicts };
      }
      throw new Error(`unexpected path ${path}`);
    },
  };
}

let wsN = 0; let server; let ws;
function setOnline(v) { try { Object.defineProperty(navigator, 'onLine', { configurable: true, value: v }); } catch { /* ignore */ } }

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  storage.__resetMemForTest();
  storage.__setDurableBackend({ available: () => false });
  sync.__resetSyncForTest();
  ws = `shop:sc${wsN++}`;
  storage.setActiveWorkspace(ws);
  localStorage.setItem('vendora:auth', JSON.stringify({ token: 't', refreshToken: 'r', shop: { id: ws.slice(5), name: 'S' } }));
  server = makeFakeServer();
  sync.__setSyncTransport(server.transport);
  setOnline(true);
});
afterEach(() => {
  sync.__setSyncTransport(null); storage.__setDurableBackend(null); sync.__resetSyncForTest(); account.__setTransport(null); setOnline(true);
});

describe('Phase 1 acceptance — data reliability', () => {
  it('connectivity disappears mid-work: the change is kept locally and syncs on reconnect', async () => {
    await sync.syncNow(); // bootstrap while online
    setOnline(false);
    storage.writeJSON('deliveries_v1', [{ id: 'd1', received: true }], ws);
    sync.markStoreDirty('deliveries_v1', 1000);

    const offline = await sync.syncNow();
    expect(offline.skipped).toBe(true);                               // nothing sent while offline
    expect(server.blobs.has('deliveries_v1')).toBe(false);
    expect(storage.readJSON('deliveries_v1', null, ws)).toEqual([{ id: 'd1', received: true }]); // kept on device
    expect(sync.getSyncState().pending).toBeGreaterThanOrEqual(1);    // still queued

    setOnline(true);
    const online = await sync.syncNow();
    expect(online.ok).toBe(true);
    expect(server.blobs.get('deliveries_v1').value).toBe(JSON.stringify([{ id: 'd1', received: true }])); // pushed on reconnect
  });

  it('session expires mid-sync: refreshes the token once and still saves the work (no loss)', async () => {
    await sync.syncNow(); // bootstrap
    storage.writeJSON('tasks_v1', [{ id: 't1' }], ws);
    sync.markStoreDirty('tasks_v1', 1000);

    account.__setTransport(async (path) => (path === '/refresh' ? { token: 't2' } : {}));
    let firstPush = true;
    sync.__setSyncTransport(async (path, opts) => {
      if (path === '/push' && firstPush) { firstPush = false; const e = new Error('token expired'); e.status = 401; throw e; }
      return server.transport(path, opts);
    });

    const res = await sync.syncNow();
    expect(res.ok).toBe(true);
    expect(server.blobs.get('tasks_v1').value).toBe(JSON.stringify([{ id: 't1' }])); // work reached the server
    expect(sync.getSyncState().pending).toBe(0);                                      // dirty cleared after retry
    expect(account.currentSession().token).toBe('t2');                               // token was refreshed
  });
});
