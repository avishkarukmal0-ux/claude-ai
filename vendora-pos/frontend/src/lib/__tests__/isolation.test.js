import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  STORE_NAMES, LOCAL_ONLY_STORE_NAMES, setActiveWorkspace, getActiveWorkspace,
} from '../storage';
import { useInvoices, __clearInvoiceFiles } from '../invoiceStore';
import { useCreditNotes } from '../creditNoteStore';

// Phase 1 — shop isolation on the device side. Uploaded invoice files are LOCAL-ONLY (never synced) and are
// scoped per workspace, so one shop's documents can't reach another's via sync or a workspace switch.
describe('isolation — uploaded invoice files', () => {
  beforeEach(() => { setActiveWorkspace('shop:isoA'); __clearInvoiceFiles('shop:isoA'); __clearInvoiceFiles('shop:isoB'); });

  it('invoice files are local-only — never in the synced store set', () => {
    expect(LOCAL_ONLY_STORE_NAMES).toContain('invoice_files_v1');
    expect(STORE_NAMES).not.toContain('invoice_files_v1'); // never pushed/pulled by sync
  });

  it('a file stored in shop A is not visible from shop B (per-workspace scope)', () => {
    setActiveWorkspace('shop:isoA');
    const a = renderHook(() => useInvoices());
    let saved;
    act(() => { saved = a.result.current.saveDraft({ supplierName: 'Booker', reference: 'INV-A', lines: [] }, { dataUrl: 'data:image/png;base64,AAAA', type: 'image' }); });
    expect(saved.ok).toBe(true);
    const fileId = saved.invoice.fileId;
    expect(a.result.current.getFile(fileId)).toBeTruthy(); // visible in A

    setActiveWorkspace('shop:isoB');
    const b = renderHook(() => useInvoices());
    expect(b.result.current.getFile(fileId)).toBeNull(); // NOT visible in B
    expect(getActiveWorkspace()).toBe('shop:isoB');
  });
});

describe('isolation — workspace-scoped stores', () => {
  it('credit notes written in one shop are not visible in another', () => {
    setActiveWorkspace('shop:isoC');
    const c = renderHook(() => useCreditNotes());
    act(() => { c.result.current.saveNote({ supplierName: 'Booker', reference: 'CN-1', amount: 10 }); });
    expect(c.result.current.notes.length).toBe(1);

    setActiveWorkspace('shop:isoD');
    const d = renderHook(() => useCreditNotes());
    expect(d.result.current.notes.length).toBe(0); // isolated per workspace
  });
});
