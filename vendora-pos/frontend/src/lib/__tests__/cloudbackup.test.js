import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __setCloudTransport, getCloudHistory, getCloudVersion, restoreCloudVersion } from '../cloudBackup';
import { getLastBackupAt, downloadBackup } from '../backup';
import { setActiveWorkspace, writeJSON, __resetMemForTest } from '../storage';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  localStorage.setItem('vendora:auth', JSON.stringify({ token: 'tkn', shop: { id: 's1', name: 'S' } }));
});
afterEach(() => { __setCloudTransport(null); });

describe('cloudBackup — client for server version history', () => {
  it('sends the session token and returns the history payload', async () => {
    const calls = [];
    __setCloudTransport(async (path, opts) => { calls.push({ path, opts }); return { enabled: true, history: { inventory_v1: [{ rev: 2, mtime: 2000, size: 10 }] } }; });
    const res = await getCloudHistory();
    expect(res.enabled).toBe(true);
    expect(res.history.inventory_v1[0].rev).toBe(2);
    expect(calls[0].path).toBe('/history');
    expect(calls[0].opts.token).toBe('tkn');
  });

  it('fetches a specific version and posts a restore', async () => {
    const calls = [];
    __setCloudTransport(async (path, opts) => {
      calls.push({ path, method: opts.method || 'GET', body: opts.body });
      if (path.startsWith('/history/')) return { name: 'inventory_v1', rev: 1, value: '[]' };
      if (path === '/restore') return { name: 'inventory_v1', rev: 4, fromRev: 1 };
      return {};
    });
    const v = await getCloudVersion('inventory_v1', 1);
    expect(v.value).toBe('[]');
    const r = await restoreCloudVersion('inventory_v1', 1);
    expect(r).toEqual({ name: 'inventory_v1', rev: 4, fromRev: 1 });
    const restoreCall = calls.find((c) => c.path === '/restore');
    expect(restoreCall.method).toBe('POST');
    expect(restoreCall.body).toEqual({ name: 'inventory_v1', rev: 1 });
  });
});

describe('backup — last successful backup (Phase 1.3c)', () => {
  it('records the time of a successful export', () => {
    expect(getLastBackupAt()).toBe(0); // none yet
    setActiveWorkspace('shop:bk');
    writeJSON('inventory_v1', [{ id: 'a' }]);
    // jsdom has no object-URL API by default — stub it so the download path completes.
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    try {
      const ok = downloadBackup();
      expect(ok).toBe(true);
      expect(getLastBackupAt()).toBeGreaterThan(0);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });
});
