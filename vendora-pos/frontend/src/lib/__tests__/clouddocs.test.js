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
