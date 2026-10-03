import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClaims } from '../claimStore';
import {
  useCreditNotes, suggestClaims, claimOutstanding, remainingToAllocate,
  creditNoteFingerprint, findDuplicateCreditNote,
} from '../creditNoteStore';
import { setActiveWorkspace } from '../storage';

let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:cn${ws++}`); });

const claim = (o) => ({ id: 'c1', status: 'approved', supplierName: 'Booker', deliveryRef: 'INV-1', requestedAmount: 20, approvedAmount: 20, receivedAmount: null, items: [], createdAt: Date.now(), updatedAt: Date.now(), ...o });

describe('creditNoteStore — outstanding + matching', () => {
  it('claimOutstanding = approved − received, floored at 0', () => {
    expect(claimOutstanding(claim({ approvedAmount: 20, receivedAmount: 5 }))).toBe(15);
    expect(claimOutstanding(claim({ approvedAmount: 20, receivedAmount: 20 }))).toBe(0);
  });

  it('suggestClaims ranks same-supplier claims with outstanding, skips other suppliers and fully-paid', () => {
    const claims = [
      claim({ id: 'a', supplierName: 'Booker', approvedAmount: 20, receivedAmount: 0 }),
      claim({ id: 'b', supplierName: 'Bestway', approvedAmount: 20, receivedAmount: 0 }),
      claim({ id: 'c', supplierName: 'Booker', approvedAmount: 10, receivedAmount: 10 }), // nothing outstanding
    ];
    const out = suggestClaims({ supplierName: 'Booker', reference: 'INV-1', amount: 20 }, claims);
    expect(out.map((x) => x.claim.id)).toEqual(['a']); // only the matching, outstanding one
  });
});

describe('creditNoteStore — duplicate detection (A8)', () => {
  it('detects a duplicate credit note by supplier + ref + date + amount', () => {
    const a = { id: 'cn_a', supplierName: 'Booker', reference: 'CN-1', date: '2026-10-01', amount: 20 };
    const b = { id: 'cn_b', supplierName: 'booker', reference: ' CN-1 ', date: '2026-10-01', amount: 20 }; // same identity
    const c = { id: 'cn_c', supplierName: 'Booker', reference: 'CN-2', date: '2026-10-01', amount: 20 }; // different ref
    expect(creditNoteFingerprint(a)).toBe(creditNoteFingerprint(b));
    expect(findDuplicateCreditNote(b, [a, c])).toMatchObject({ id: 'cn_a' });
    expect(findDuplicateCreditNote(c, [a])).toBeNull();
  });
});

describe('claimStore.applyCredit — allocation (audit W-credit)', () => {
  it('received is the sum of applied credits and is idempotent per credit note (no double-count)', () => {
    const { result } = renderHook(() => useClaims());
    let id;
    act(() => { id = result.current.createClaim({ supplierName: 'Booker', items: [{ name: 'Cola', qty: 2, reason: 'missing', amount: 20 }] }).id; });
    act(() => { result.current.advance(id, 'submitted'); result.current.advance(id, 'approved'); });

    act(() => { result.current.applyCredit(id, { creditNoteId: 'cn1', creditNoteRef: 'CN-9', amount: 8 }); });
    expect(result.current.claims.find((c) => c.id === id).receivedAmount).toBeCloseTo(8);

    // Re-applying the SAME credit note replaces its slice — not added twice.
    act(() => { result.current.applyCredit(id, { creditNoteId: 'cn1', creditNoteRef: 'CN-9', amount: 10 }); });
    expect(result.current.claims.find((c) => c.id === id).receivedAmount).toBeCloseTo(10);

    // A DIFFERENT credit note adds on top (multi-credit claim).
    act(() => { result.current.applyCredit(id, { creditNoteId: 'cn2', creditNoteRef: 'CN-10', amount: 5 }); });
    const c = result.current.claims.find((x) => x.id === id);
    expect(c.receivedAmount).toBeCloseTo(15);
    expect(c.credits).toHaveLength(2);
    expect(c.history.some((h) => h.event === 'credit')).toBe(true);
  });

  it('removeCredit recomputes received (correction) and keeps an audit trail', () => {
    const { result } = renderHook(() => useClaims());
    let id;
    act(() => { id = result.current.createClaim({ supplierName: 'B', items: [{ name: 'X', qty: 1, reason: 'missing', amount: 10 }] }).id; });
    act(() => { result.current.applyCredit(id, { creditNoteId: 'cnA', amount: 6 }); });
    act(() => { result.current.applyCredit(id, { creditNoteId: 'cnB', amount: 4 }); });
    act(() => { result.current.removeCredit(id, 'cnA'); });
    const c = result.current.claims.find((x) => x.id === id);
    expect(c.receivedAmount).toBeCloseTo(4);
    expect(c.history.some((h) => h.event === 'credit-removed')).toBe(true);
  });
});

describe('credit allocation — £0 clears BOTH ledgers (audit D6, no double-count)', () => {
  it('reducing an allocation to £0 frees it on the note AND removes the claim credit', () => {
    const notesHook = renderHook(() => useCreditNotes());
    const claimsHook = renderHook(() => useClaims());
    let noteId, claimId;
    act(() => { noteId = notesHook.result.current.saveNote({ supplierName: 'Booker', reference: 'CN-1', amount: 10 }).note.id; });
    act(() => { claimId = claimsHook.result.current.createClaim({ supplierName: 'Booker', items: [{ name: 'Cola', qty: 1, reason: 'missing', amount: 10 }] }).id; });
    act(() => { claimsHook.result.current.advance(claimId, 'submitted'); claimsHook.result.current.advance(claimId, 'approved'); });

    // Allocate the full note to the claim — both ledgers move together.
    act(() => { notesHook.result.current.setAllocation(noteId, claimId, 10); });
    act(() => { claimsHook.result.current.applyCredit(claimId, { creditNoteId: noteId, amount: 10 }); });
    expect(remainingToAllocate(notesHook.result.current.notes.find((n) => n.id === noteId))).toBeCloseTo(0);
    expect(claimsHook.result.current.claims.find((c) => c.id === claimId).receivedAmount).toBeCloseTo(10);

    // D6: setting it to £0 must clear BOTH sides. The view routes £0 through setAllocation(0) + removeCredit —
    // previously applyCredit(…,0) was a no-op, so the claim kept the £10 while the note read "unallocated",
    // letting the same £10 be re-allocated elsewhere (double-count).
    act(() => { notesHook.result.current.setAllocation(noteId, claimId, 0); });
    act(() => { claimsHook.result.current.removeCredit(claimId, noteId); });
    expect(remainingToAllocate(notesHook.result.current.notes.find((n) => n.id === noteId))).toBeCloseTo(10); // fully free again
    expect(claimsHook.result.current.claims.find((c) => c.id === claimId).receivedAmount).toBeNull();        // claim no longer credited
  });
});

describe('useCreditNotes — over-allocation guard', () => {
  it('cannot allocate more than the credit note amount across claims', () => {
    const { result } = renderHook(() => useCreditNotes());
    let noteId;
    act(() => { noteId = result.current.saveNote({ supplierName: 'Booker', reference: 'CN-1', amount: 10 }).note.id; });
    let r1; act(() => { r1 = result.current.setAllocation(noteId, 'c1', 7); });
    expect(r1.ok).toBe(true);
    let r2; act(() => { r2 = result.current.setAllocation(noteId, 'c2', 5); }); // 7 + 5 > 10
    expect(r2.ok).toBe(false);
    const note = result.current.notes.find((x) => x.id === noteId);
    expect(remainingToAllocate(note)).toBeCloseTo(3); // only the 7 stuck
  });
});
