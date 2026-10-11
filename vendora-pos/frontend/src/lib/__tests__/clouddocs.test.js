import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  backupInvoiceFile, deleteBackup, listBackedUp, backupStatusOf, getBackupState,
  __setDocTransport, __clearBackupStateForTest,
} from '../cloudDocs';
import { setActiveWorkspace, LOCAL_WORKSPACE, __resetMemForTest } from '../storage';

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo='; // tiny stub

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace(LOCAL_WORKSPACE);
  __clearBackupStateForTest();
  // Stub the data-URL → Blob conversion (jsdom fetch doesn't do data: URLs reliably).
  global.fetch = vi.fn(async () => ({ blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) }));
});
afterEach(() => { __setDocTransport(null); vi.restoreAllMocks(); });

describe('cloudDocs — backup state machine', () => {
  it('marks a file uploaded on success and records the size', async () => {
    __setDocTransport({ uploadReq: async () => ({ ok: true, size: 3 }), jsonReq: async () => ({}), downloadReq: async () => null });
    const r = await backupInvoiceFile({ fileId: 'if_1', dataUrl: DATA_URL, invoiceId: 'inv_1' });
    expect(r.ok).toBe(true);
    expect(backupStatusOf('if_1')).toBe('uploaded');
    expect(getBackupState().if_1.size).toBe(3);
  });

  it('marks a file failed on error (and keeps the error for retry)', async () => {
    __setDocTransport({ uploadReq: async () => { throw new Error('network down'); }, jsonReq: async () => ({}), downloadReq: async () => null });
    const r = await backupInvoiceFile({ fileId: 'if_2', dataUrl: DATA_URL });
    expect(r.ok).toBe(false);
    expect(backupStatusOf('if_2')).toBe('failed');
    expect(getBackupState().if_2.error).toMatch(/network down/);
  });

  it('refuses when nothing to back up', async () => {
    const r = await backupInvoiceFile({ fileId: '', dataUrl: '' });
    expect(r.ok).toBe(false);
  });

  it('deleteBackup clears local state', async () => {
    __setDocTransport({ uploadReq: async () => ({ ok: true, size: 3 }), jsonReq: async () => ({ ok: true, deleted: 1 }), downloadReq: async () => null });
    await backupInvoiceFile({ fileId: 'if_3', dataUrl: DATA_URL });
    expect(backupStatusOf('if_3')).toBe('uploaded');
    await deleteBackup('if_3');
    expect(backupStatusOf('if_3')).toBe('none');
  });

  it('listBackedUp returns the server set of fileIds', async () => {
    __setDocTransport({ jsonReq: async (p) => (p === '/invoice' ? { files: [{ fileId: 'a' }, { fileId: 'b' }] } : {}), uploadReq: async () => ({}), downloadReq: async () => null });
    const set = await listBackedUp();
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(true);
    expect(set.has('c')).toBe(false);
  });
});

describe('cloudDocs — F1: session/workspace pinned across the async upload', () => {
  it('an account/workspace switch mid-upload CANCELS (no upload, nothing written into the other shop)', async () => {
    let uploads = 0;
    __setDocTransport({ uploadReq: async () => { uploads += 1; return { ok: true, size: 3 }; }, jsonReq: async () => ({}), downloadReq: async () => null });
    setActiveWorkspace('shop:A');
    // Switch to shop B during the first async step (the data-URL → blob read).
    global.fetch = vi.fn(async () => { setActiveWorkspace('shop:B'); return { blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) }; });
    const r = await backupInvoiceFile({ fileId: 'if_switch', dataUrl: DATA_URL });
    expect(r.ok).toBe(false);
    expect(r.cancelled).toBe(true);
    expect(uploads).toBe(0);                                      // never uploaded under the wrong shop
    expect(getBackupState('shop:B').if_switch).toBeUndefined();   // nothing written into shop B
    // The pending marker only ever touched the original shop A.
    expect(getBackupState('shop:A').if_switch?.status).toBe('pending');
  });
});
