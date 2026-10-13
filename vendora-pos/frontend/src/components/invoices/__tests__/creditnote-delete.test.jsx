import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import CreditNotesView from '../CreditNotesView';
import { hasRecovery, recordRecovery } from '../../../lib/recoveryGuard';
import * as storageNs from '../../../lib/storage';

const { writeJSON, readJSON, setActiveWorkspace, __resetMemForTest } = storageNs;

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace('shop:r9');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Audit R9 (round 3): deleting a credit note ignored each removeCredit result and deleted the note anyway — so a
// failed claim-side write left the note gone while the claim still credited the money (the two ledgers split).
describe('CreditNotesView — delete aborts (keeps the note) when a claim-side write fails (R9)', () => {
  it('a failed removeCredit keeps the note instead of splitting the ledgers', () => {
    writeJSON('credit_notes_v1', [{
      id: 'cn1', supplierName: 'Bookerzz', reference: 'CR-1', amount: 10, date: Date.now(),
      allocations: [{ claimId: 'cl1', amount: 10 }],
    }]);
    writeJSON('claims_v1', [{
      id: 'cl1', supplierName: 'Bookerzz', status: 'approved', approvedAmount: 10, receivedAmount: 10,
      credits: [{ creditNoteId: 'cn1', amount: 10 }], history: [],
    }]);

    const { getByLabelText, getByText, container } = render(<CreditNotesView onBack={() => {}} />);
    expect(getByLabelText(/Delete credit note/)).toBeTruthy();
    expect(container.textContent).toContain('Bookerzz');

    // Open the accessible confirm dialog, then confirm with the claim-side write failing.
    fireEvent.click(getByLabelText(/Delete credit note/));
    const orig = storageNs.writeJSON;
    const spy = vi.spyOn(storageNs, 'writeJSON').mockImplementation((name, value, ws) => (name === 'claims_v1' ? { ok: false, error: 'quota' } : orig(name, value, ws)));
    fireEvent.click(getByText('Delete')); // dialog confirm
    spy.mockRestore();

    // The note survives (pre-fix it would have been deleted while the claim still credited £10).
    expect(getByLabelText(/Delete credit note/)).toBeTruthy();
    expect(container.textContent).toContain('Bookerzz');
  });

  // Audit V2 (round 4): if the NOTE write fails AFTER the claim credit was removed, the two ledgers split
  // (claim £0, note still £10 allocated). The fix compensates by re-applying the claim credit.
  it('a failed note write after claim removal is compensated (ledgers stay consistent)', () => {
    writeJSON('credit_notes_v1', [{
      id: 'cn2', supplierName: 'Splitco', reference: 'CR-2', amount: 10, date: Date.now(),
      allocations: [{ claimId: 'cl2', amount: 10 }],
    }]);
    writeJSON('claims_v1', [{
      id: 'cl2', supplierName: 'Splitco', status: 'approved', approvedAmount: 10, receivedAmount: 10,
      credits: [{ creditNoteId: 'cn2', amount: 10 }], history: [],
    }]);

    const { getByLabelText, getByText } = render(<CreditNotesView onBack={() => {}} />);
    fireEvent.click(getByLabelText(/Delete credit note/));
    // The claim-side removal (claims_v1) succeeds; only the NOTE write (credit_notes_v1) fails.
    const orig = storageNs.writeJSON;
    const spy = vi.spyOn(storageNs, 'writeJSON').mockImplementation((name, value, ws) => (name === 'credit_notes_v1' ? { ok: false, error: 'quota' } : orig(name, value, ws)));
    fireEvent.click(getByText('Delete')); // dialog confirm
    spy.mockRestore();

    // Note kept (its write failed) AND the claim credit was restored — not left split at claim £0.
    const note = readJSON('credit_notes_v1', []).find((n) => n.id === 'cn2');
    const claim = readJSON('claims_v1', []).find((c) => c.id === 'cl2');
    expect(note).toBeTruthy();
    expect((claim.credits || []).some((cr) => cr.creditNoteId === 'cn2' && cr.amount === 10)).toBe(true);
    expect(claim.receivedAmount).toBe(10); // consistent with the note's £10 allocation
  });

  // Audit V2 residual (round 5): when the compensating applyCredit ALSO fails, round 4 ignored its result and
  // falsely reported "restored" with no flag. Now it records a durable pending-repair flag.
  it('V2 r5: a Delete whose note write AND compensation both fail records a pending-repair flag', () => {
    writeJSON('credit_notes_v1', [{
      id: 'cn3', supplierName: 'Splitco2', reference: 'CR-3', amount: 10, date: Date.now(),
      allocations: [{ claimId: 'cl3', amount: 10 }],
    }]);
    writeJSON('claims_v1', [{
      id: 'cl3', supplierName: 'Splitco2', status: 'approved', approvedAmount: 10, receivedAmount: 10,
      credits: [{ creditNoteId: 'cn3', amount: 10 }], history: [],
    }]);
    const { getByLabelText, getByText } = render(<CreditNotesView onBack={() => {}} />);
    fireEvent.click(getByLabelText(/Delete credit note/));
    const orig = storageNs.writeJSON;
    let claimsCalls = 0; // removeCredit (1st claims write) succeeds; the compensating applyCredit (2nd) fails
    const spy = vi.spyOn(storageNs, 'writeJSON').mockImplementation((name, value, ws) => {
      if (name === 'claims_v1') { claimsCalls += 1; return claimsCalls === 1 ? orig(name, value, ws) : { ok: false, error: 'quota' }; }
      if (name === 'credit_notes_v1') return { ok: false, error: 'quota' }; // the note write fails
      return orig(name, value, ws);
    });
    fireEvent.click(getByText('Delete')); // dialog confirm
    spy.mockRestore();
    expect(hasRecovery('creditnote:cn3')).toBe(true); // round 4 recorded nothing here
  });

  // Audit V2 residual (round 5): the pending-repair flag was checked only by Delete; onApply/onUnapply could
  // still mutate a flagged note. Now every allocation callback refuses.
  it('V2 r5: a flagged note cannot be mutated through the allocation callbacks', () => {
    writeJSON('credit_notes_v1', [{
      id: 'cn5', supplierName: 'Blockedco', reference: 'CR-5', amount: 10, date: Date.now(),
      allocations: [{ claimId: 'cl5', amount: 10 }],
    }]);
    writeJSON('claims_v1', [{
      id: 'cl5', supplierName: 'Blockedco', status: 'approved', approvedAmount: 10, receivedAmount: 10,
      credits: [{ creditNoteId: 'cn5', amount: 10 }], history: [],
    }]);
    recordRecovery('creditnote:cn5', { kind: 'creditnote' }); // the note is in pending-repair

    const { getByText } = render(<CreditNotesView onBack={() => {}} />);
    fireEvent.click(getByText('Match to claims'));
    fireEvent.click(getByText('Remove')); // the allocation Remove callback must refuse

    const claim = readJSON('claims_v1', []).find((c) => c.id === 'cl5');
    expect((claim.credits || []).length).toBe(1); // unchanged — the callback was gated by the flag
    expect(claim.receivedAmount).toBe(10);
  });
});
