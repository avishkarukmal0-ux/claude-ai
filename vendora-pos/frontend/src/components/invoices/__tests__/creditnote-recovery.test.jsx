import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import CreditNoteRecoveryView from '../CreditNoteRecoveryView';
import { creditNoteReconciliation } from '../../../lib/creditNoteStore';
import { hasRecovery, recordRecovery } from '../../../lib/recoveryGuard';
import * as storageNs from '../../../lib/storage';

const { writeJSON, readJSON, setActiveWorkspace, __resetMemForTest } = storageNs;

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace('shop:cnrec');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('creditNoteReconciliation (pure)', () => {
  const note = { id: 'cn1', reference: 'CR-1', amount: 10, allocations: [{ claimId: 'cl1', amount: 10 }] };
  it('flags a split (note allocates £10, claim credits £0)', () => {
    const { rows, consistent } = creditNoteReconciliation(note, [{ id: 'cl1', credits: [] }]);
    expect(consistent).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ claimId: 'cl1', allocated: 10, credited: 0, consistent: false });
  });
  it('is consistent when the claim credits the matching amount', () => {
    const { consistent } = creditNoteReconciliation(note, [{ id: 'cl1', credits: [{ creditNoteId: 'cn1', amount: 10 }] }]);
    expect(consistent).toBe(true);
  });
  it('flags an orphan claim credit with no matching allocation', () => {
    const bare = { id: 'cn1', allocations: [] };
    const { rows, consistent } = creditNoteReconciliation(bare, [{ id: 'cl1', credits: [{ creditNoteId: 'cn1', amount: 10 }] }]);
    expect(consistent).toBe(false);
    expect(rows[0]).toMatchObject({ allocated: 0, credited: 10 });
  });
});

describe('CreditNoteRecoveryView — guided reconciliation (round-6 polish)', () => {
  function seedSplit() {
    // Note says £10 allocated to the claim, but the claim records £0 received — the split a failed save leaves.
    writeJSON('credit_notes_v1', [{ id: 'cn1', supplierName: 'Bookerz', reference: 'CR-1', amount: 10, date: Date.now(), allocations: [{ claimId: 'cl1', amount: 10 }] }]);
    writeJSON('claims_v1', [{ id: 'cl1', supplierName: 'Bookerz', status: 'approved', approvedAmount: 10, receivedAmount: null, credits: [], history: [] }]);
    recordRecovery('creditnote:cn1', { kind: 'creditnote' });
  }

  it('reconciles the split, verifies both sides, then clears the lock', () => {
    seedSplit();
    const { getByText } = render(<CreditNoteRecoveryView onBack={() => {}} />);
    expect(hasRecovery('creditnote:cn1')).toBe(true);
    // The owner can see exactly what reconcile will do before tapping.
    expect(getByText(/Reconcile will set this claim to £10\.00/)).toBeTruthy();
    fireEvent.click(getByText(/Reconcile this credit note/));
    // The claim now credits the allocated £10 (applied through the validated store op)…
    const claim = readJSON('claims_v1', []).find((c) => c.id === 'cl1');
    expect((claim.credits || []).some((cr) => cr.creditNoteId === 'cn1' && cr.amount === 10)).toBe(true);
    expect(claim.receivedAmount).toBe(10);
    // …and only THEN is the lock cleared.
    expect(hasRecovery('creditnote:cn1')).toBe(false);
  });

  it('keeps the note locked when a corrective write fails (never a silent clear)', () => {
    seedSplit();
    const { getByText } = render(<CreditNoteRecoveryView onBack={() => {}} />);
    const orig = storageNs.writeJSON;
    const spy = vi.spyOn(storageNs, 'writeJSON').mockImplementation((name, value, ws) => (name === 'claims_v1' ? { ok: false, error: 'quota' } : orig(name, value, ws)));
    fireEvent.click(getByText(/Reconcile this credit note/));
    spy.mockRestore();
    expect(hasRecovery('creditnote:cn1')).toBe(true); // still locked — the corrective write failed
  });
});
