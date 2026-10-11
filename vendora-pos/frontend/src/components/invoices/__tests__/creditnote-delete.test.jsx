import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import CreditNotesView from '../CreditNotesView';
import * as storageNs from '../../../lib/storage';

const { writeJSON, setActiveWorkspace, __resetMemForTest } = storageNs;

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

    const { getAllByLabelText, container } = render(<CreditNotesView onBack={() => {}} />);
    expect(getAllByLabelText('Delete')).toHaveLength(1);
    expect(container.textContent).toContain('Bookerzz');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    // Make the claim-side correction fail; the note delete must then NOT happen.
    const orig = storageNs.writeJSON;
    const spy = vi.spyOn(storageNs, 'writeJSON').mockImplementation((name, value, ws) => (name === 'claims_v1' ? { ok: false, error: 'quota' } : orig(name, value, ws)));
    fireEvent.click(getAllByLabelText('Delete')[0]);
    spy.mockRestore();

    // The note survives (pre-fix it would have been deleted while the claim still credited £10).
    expect(getAllByLabelText('Delete')).toHaveLength(1);
    expect(container.textContent).toContain('Bookerzz');
  });
});
