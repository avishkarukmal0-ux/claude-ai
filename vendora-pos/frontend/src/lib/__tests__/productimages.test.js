import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveImage, saveImage, removeImage, restoreImage, getThumbLocal, confirmSuggested,
  backupImage, retryBackups, deleteBackup, getBackupState, pendingBackupCount,
  fetchImageToCache, BACKUP_STATE,
  __setDownscale, __setImageTransport, __setBackupAvailability,
} from '../productImages';
import { setActiveWorkspace, LOCAL_WORKSPACE, __resetMemForTest } from '../storage';
import * as storageNs from '../storage';

const AUTH_KEY = 'vendora:auth';

const DATA = 'data:image/jpeg;base64,/9j/AAA=';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace(LOCAL_WORKSPACE);
  __setDownscale(async (src) => (typeof src === 'string' ? src : DATA)); // identity compressor for tests
  // fetch stub: data-URL → Blob (for dataUrlToBlob), and the suggested-image proxy → a blob.
  global.fetch = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }) }));
});
afterEach(() => { __setDownscale(null); __setImageTransport(null); vi.restoreAllMocks(); });

describe('productImages — selection order', () => {
  it('owner saved photo wins', () => {
    const r = resolveImage({ image: { id: 'pi_1', source: 'owner' } }, { image: 'http://x/y.jpg' });
    expect(r.state).toBe('owner');
    expect(r.id).toBe('pi_1');
  });
  it('catalogue image when source is catalogue', () => {
    const r = resolveImage({ image: { id: 'pi_2', source: 'catalogue', attribution: 'OFF' } }, null);
    expect(r.state).toBe('catalogue');
    expect(r.attribution).toBe('OFF');
  });
  it('provider suggestion when no saved image', () => {
    const r = resolveImage({}, { image: 'https://img/x.jpg', imageLarge: 'https://img/xl.jpg', imageAttribution: 'Photo: OFF' });
    expect(r.state).toBe('suggested');
    expect(r.confirmed).toBe(false);
    expect(r.attribution).toBe('Photo: OFF');
  });
  it('placeholder when nothing available', () => {
    expect(resolveImage({}, null).state).toBe('placeholder');
  });
  it('a soft-deleted image falls back (not shown as owner)', () => {
    const r = resolveImage({ image: { id: 'pi_3', source: 'owner', deleted: true } }, null);
    expect(r.state).toBe('placeholder');
  });
});

describe('productImages — save / recoverable delete', () => {
  it('saves an owner image locally (full + thumb) and reads the thumb back', async () => {
    const saved = await saveImage(DATA, { source: 'owner' });
    expect(saved.ok).toBe(true);
    expect(getThumbLocal(saved.id)).toBeTruthy();
  });

  it('remove is recoverable; restore brings it back', async () => {
    const saved = await saveImage(DATA, { source: 'owner' });
    const del = await removeImage(saved.id);
    expect(del.recoverable).toBe(true);
    expect(getThumbLocal(saved.id)).toBe(null);
    const res = await restoreImage(saved.id);
    expect(res.ok).toBe(true);
    expect(getThumbLocal(saved.id)).toBeTruthy();
  });
});

describe('productImages — confirm a provider suggestion', () => {
  it('downloads, stores as a catalogue image with attribution, and returns a ref', async () => {
    __setImageTransport({ status: async () => ({ enabled: false }), upload: async () => ({}), download: async () => null });
    const ref = await confirmSuggested(
      { image: 'https://images.openfoodfacts.org/x.jpg', imageLarge: 'https://images.openfoodfacts.org/xl.jpg', imageAttribution: 'Photo: Open Food Facts contributors (CC BY-SA 3.0)' },
      { barcode: '5000000000000' },
    );
    expect(ref).toBeTruthy();
    expect(ref.source).toBe('catalogue');
    expect(ref.attribution).toMatch(/Open Food Facts/);
    expect(getThumbLocal(ref.id)).toBeTruthy(); // stored locally
  });

  it('returns null when nothing to confirm', async () => {
    expect(await confirmSuggested(null)).toBe(null);
    expect(await confirmSuggested({})).toBe(null);
  });
});

describe('productImages — backup lifecycle (local → pending → backed-up / failed → retry)', () => {
  afterEach(() => { __setBackupAvailability(null); });

  it('an upload moves the image to backed-up; getBackupState reflects it', async () => {
    __setBackupAvailability(true);
    const uploads = [];
    __setImageTransport({ status: async () => ({ enabled: true }), upload: async (id) => { uploads.push(id); return {}; }, download: async () => null, remove: async () => true });
    const saved = await saveImage(DATA, { source: 'owner' });
    const r = await backupImage(saved.id, { source: 'owner' });
    expect(r.ok).toBe(true);
    expect(getBackupState(saved.id).state).toBe(BACKUP_STATE.DONE);
    expect(uploads).toContain(saved.id);
  });

  it('a failed upload is marked failed and is retryable; retry succeeds', async () => {
    __setBackupAvailability(true);
    let failNext = true;
    __setImageTransport({
      status: async () => ({ enabled: true }),
      upload: async () => { if (failNext) { const e = new Error('boom'); throw e; } return {}; },
      download: async () => null, remove: async () => true,
    });
    const saved = await saveImage(DATA, { source: 'owner' });
    const r1 = await backupImage(saved.id, { source: 'owner' });
    expect(r1.ok).toBe(false);
    expect(getBackupState(saved.id).state).toBe(BACKUP_STATE.FAILED);
    expect(pendingBackupCount()).toBe(1);

    failNext = false;
    const res = await retryBackups();
    expect(res.ok).toBe(1);
    expect(getBackupState(saved.id).state).toBe(BACKUP_STATE.DONE);
    expect(pendingBackupCount()).toBe(0);
  });

  it('when backup is unavailable the image is queued (failed) for later retry', async () => {
    __setBackupAvailability(false);
    const saved = await saveImage(DATA, { source: 'owner' });
    const r = await backupImage(saved.id, { source: 'owner' });
    expect(r.ok).toBe(false);
    expect(getBackupState(saved.id).state).toBe(BACKUP_STATE.FAILED);
    expect(pendingBackupCount()).toBe(1);
  });

  it('second-device recovery: fetchImageToCache pulls bytes and marks them backed-up here', async () => {
    __setBackupAvailability(true);
    __setImageTransport({
      status: async () => ({ enabled: true }), upload: async () => ({}),
      download: async () => new Blob([new Uint8Array([9, 9, 9])], { type: 'image/jpeg' }),
      remove: async () => true,
    });
    const id = 'pi_fromserver';
    expect(getThumbLocal(id)).toBe(null); // not on this device yet
    const r = await fetchImageToCache(id);
    expect(r.ok).toBe(true);
    expect(getThumbLocal(id)).toBeTruthy();
    expect(getBackupState(id).state).toBe(BACKUP_STATE.DONE);
  });

  it('FE1: an async save stays in the workspace it STARTED in, even if the shop switches mid-await', async () => {
    // Slow the processing so we can switch workspace before it resolves.
    __setDownscale((src) => new Promise((res) => { setTimeout(() => res(typeof src === 'string' ? src : DATA), 10); }));
    setActiveWorkspace('ws-A');
    const p = saveImage(DATA, { source: 'owner' }); // ws captured = ws-A
    setActiveWorkspace('ws-B'); // user switches shop while processing is in flight
    const saved = await p;
    setActiveWorkspace('ws-A');
    expect(getThumbLocal(saved.id)).toBeTruthy(); // written under A (the originating shop)
    setActiveWorkspace('ws-B');
    expect(getThumbLocal(saved.id)).toBe(null); // NOT leaked into B
  });

  it('deleteBackup removes the server copy and clears local state', async () => {
    __setBackupAvailability(true);
    const removed = [];
    __setImageTransport({ status: async () => ({ enabled: true }), upload: async () => ({}), download: async () => null, remove: async (id) => { removed.push(id); return true; } });
    const saved = await saveImage(DATA, { source: 'owner' });
    await backupImage(saved.id, { source: 'owner' });
    const d = await deleteBackup(saved.id);
    expect(d.ok).toBe(true);
    expect(removed).toContain(saved.id);
    expect(getBackupState(saved.id).state).toBe(BACKUP_STATE.LOCAL);
  });
});

describe('productImages — F2 (session pin) + F4 (commit-before-delete)', () => {
  it('F2: signing OUT mid-save cancels (does not recreate the shop photo in the purged workspace)', async () => {
    try { localStorage.setItem(AUTH_KEY, JSON.stringify({ token: 't', shop: { id: 'shopA' } })); } catch { /* ignore */ }
    setActiveWorkspace('shop:shopA');
    __setDownscale((src) => new Promise((res) => { setTimeout(() => res(typeof src === 'string' ? src : DATA), 10); }));
    const p = saveImage(DATA, { source: 'owner' });
    try { localStorage.removeItem(AUTH_KEY); } catch { /* ignore */ } // sign out while processing
    setActiveWorkspace(LOCAL_WORKSPACE);
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.cancelled).toBe(true);
    expect(getThumbLocal(r.id || 'x', 'shop:shopA')).toBe(null); // nothing recreated in the purged shop workspace
  });

  it('F4: a failed trash write keeps the originals (removeImage reports not-ok, not recoverable)', async () => {
    setActiveWorkspace('shop:f4');
    const saved = await saveImage(DATA, { source: 'owner' });
    expect(getThumbLocal(saved.id)).toBeTruthy();
    const spy = vi.spyOn(storageNs, 'writeDurable').mockResolvedValue({ ok: false, error: 'quota' });
    const res = await removeImage(saved.id);
    spy.mockRestore();
    expect(res.ok).toBe(false);
    expect(res.recoverable).toBe(false);
    expect(getThumbLocal(saved.id)).toBeTruthy(); // originals NOT deleted (commit-before-delete)
  });

  it('R1: a trashed photo whose DURABLE commit fails is NOT deleted (confirms the commit, not just sync ok)', async () => {
    setActiveWorkspace('shop:r1');
    const saved = await saveImage(DATA, { source: 'owner' });
    expect(getThumbLocal(saved.id)).toBeTruthy();
    // Force the OVERFLOW path: localStorage rejects (quota) while IndexedDB is "available" but its commit FAILS.
    // Round 2 trusted write()'s synchronous `{ok:true, overflow:true}` here and would have deleted the originals
    // before the (failing) IndexedDB commit; the fix awaits writeDurable, which reads the trash back and reports
    // failure — so the only copy survives.
    const failDurable = { available: () => true, set: async () => { throw new Error('idb commit failed'); }, get: async () => undefined, del: async () => true, getAll: async () => [] };
    storageNs.__setDurableBackend(failDurable);
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    const res = await removeImage(saved.id);
    setSpy.mockRestore();
    storageNs.__setDurableBackend(null);
    expect(res.ok).toBe(false);
    expect(res.recoverable).toBe(false);
    expect(getThumbLocal(saved.id)).toBeTruthy(); // the only copy survives
  });

  it('F4 r2: a THUMBNAIL-ONLY restore whose thumb write fails reports not-ok and KEEPS the trash', async () => {
    setActiveWorkspace('shop:f4b');
    const id = 'pi_thumbonly';
    // Seed a thumbnail-only trash entry (no full) — e.g. a legacy image, or a full that never stored.
    storageNs.write(`pimg_trash_${id}`, JSON.stringify({ full: null, thumb: DATA, at: Date.now() }));
    const spy = vi.spyOn(storageNs, 'writeDurable').mockResolvedValue({ ok: false, error: 'quota' });
    const res = await restoreImage(id);
    spy.mockRestore();
    expect(res.ok).toBe(false); // round 1 only checked the full (true for a thumb-only) → wrongly reported ok
    // The trash is still present, so a retry can recover it.
    const retry = await restoreImage(id);
    expect(retry.ok).toBe(true);
    expect(getThumbLocal(id)).toBeTruthy();
  });
});

describe('productImages — F2 round 2: no recreation in a purged workspace after an async op', () => {
  afterEach(() => { __setBackupAvailability(null); try { localStorage.removeItem(AUTH_KEY); } catch { /* ignore */ } });

  it('backupImage: signing OUT during the upload does not write a DONE record in the purged shop', async () => {
    try { localStorage.setItem(AUTH_KEY, JSON.stringify({ token: 't', shop: { id: 'shopB' } })); } catch { /* ignore */ }
    setActiveWorkspace('shop:shopB');
    const saved = await saveImage(DATA, { source: 'owner' });
    __setBackupAvailability(true);
    __setImageTransport({
      status: async () => ({ enabled: true }),
      upload: async () => { try { localStorage.removeItem(AUTH_KEY); } catch { /* ignore */ } return {}; }, // sign out mid-upload
      download: async () => null, remove: async () => true,
    });
    const r = await backupImage(saved.id, { source: 'owner', ws: 'shop:shopB', token: 't' });
    expect(r.cancelled).toBe(true);
    setActiveWorkspace('shop:shopB');
    expect(getBackupState(saved.id).state).not.toBe(BACKUP_STATE.DONE); // DONE not recreated after the account change
  });

  it('R6: confirmSuggested signing OUT during the image FETCH does not recreate the shop photo', async () => {
    try { localStorage.setItem(AUTH_KEY, JSON.stringify({ token: 'tc', shop: { id: 'shopR6' } })); } catch { /* ignore */ }
    setActiveWorkspace('shop:shopR6');
    // The suggested-image fetch RESOLVES after the account has signed out — the window saveImage's own (later)
    // session pin used to miss, writing the photo into the purged workspace.
    global.fetch = vi.fn(async () => {
      try { localStorage.removeItem(AUTH_KEY); } catch { /* ignore */ }
      setActiveWorkspace(LOCAL_WORKSPACE);
      return { ok: true, status: 200, blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }) };
    });
    const ref = await confirmSuggested(
      { image: 'https://images.openfoodfacts.org/x.jpg', imageLarge: 'https://images.openfoodfacts.org/xl.jpg', imageAttribution: 'OFF' },
      { barcode: '5000000000001' },
    );
    expect(ref).toBe(null); // cancelled — the account changed during the fetch
    setActiveWorkspace('shop:shopR6');
    // No catalogue image bytes were recreated in the purged shop workspace.
    const map = (() => { try { return JSON.parse(storageNs.read('pimg_backup_v1', 'null', 'shop:shopR6')) || {}; } catch { return {}; } })();
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('fetchImageToCache: switching accounts during the download does not write bytes into the purged shop', async () => {
    try { localStorage.setItem(AUTH_KEY, JSON.stringify({ token: 't2', shop: { id: 'shopC' } })); } catch { /* ignore */ }
    setActiveWorkspace('shop:shopC');
    __setBackupAvailability(true);
    __setImageTransport({
      status: async () => ({ enabled: true }), upload: async () => ({}),
      download: async () => { try { localStorage.removeItem(AUTH_KEY); } catch { /* ignore */ } return new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }); },
      remove: async () => true,
    });
    const id = 'pi_fetch_f2r2';
    const r = await fetchImageToCache(id);
    expect(r.cancelled).toBe(true);
    setActiveWorkspace('shop:shopC');
    expect(getThumbLocal(id)).toBe(null); // nothing recreated in the purged shop workspace
  });
});
