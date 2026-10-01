import { describe, it, expect } from 'vitest';
import {
  claimTarget, claimReceived, claimOutstanding, allocationsOf,
  creditReceivedInPeriod, creditOutstanding, creditSummary,
} from '../creditReport';
import { monthlyOutcomes } from '../outcomes';

const OCT = new Date('2026-10-15T12:00:00Z').getTime();
const OCT_5 = new Date('2026-10-05T09:00:00Z').getTime();
const SEP_20 = new Date('2026-09-20T09:00:00Z').getTime();

const credit = (creditNoteId, amount, at) => ({ id: `cr_${creditNoteId}`, creditNoteId, amount, at });

describe('creditReport — period attribution', () => {
  it('counts each allocation in the month of its own received date', () => {
    const claim = {
      status: 'approved', approvedAmount: 30,
      credits: [credit('A', 10, SEP_20), credit('B', 7, OCT_5)],
    };
    expect(creditReceivedInPeriod([claim], OCT)).toBe(7);   // only October's allocation
    expect(creditReceivedInPeriod([claim], SEP_20)).toBe(10); // only September's
  });

  it('includes partial credits on claims that remain OPEN (not just settled)', () => {
    const open = { status: 'approved', approvedAmount: 20, credits: [credit('A', 8, OCT_5)] };
    expect(creditReceivedInPeriod([open], OCT)).toBe(8);
  });
});

describe('creditReport — outstanding subtracts received', () => {
  it('outstanding = target − received, floored at 0', () => {
    expect(claimOutstanding({ status: 'approved', approvedAmount: 20, receivedAmount: 5 })).toBe(15);
    expect(claimOutstanding({ status: 'approved', approvedAmount: 20, credits: [credit('A', 20, OCT_5)] })).toBe(0);
    expect(claimOutstanding({ status: 'approved', approvedAmount: 20, credits: [credit('A', 25, OCT_5)] })).toBe(0); // can't go negative
  });

  it('a partial credit lowers the outstanding total', () => {
    const claims = [
      { status: 'approved', approvedAmount: 20, credits: [credit('A', 8, OCT_5)] }, // 12 left
      { status: 'submitted', requestedAmount: 5 },                                   // 5 left
    ];
    expect(creditOutstanding(claims)).toBe(17);
  });

  it('settled and rejected claims are not counted as outstanding', () => {
    const claims = [
      { status: 'settled', approvedAmount: 10, credits: [credit('A', 10, OCT_5)] },
      { status: 'rejected', requestedAmount: 99 },
      { status: 'draft', requestedAmount: 50 },
    ];
    expect(creditOutstanding(claims)).toBe(0);
  });
});

describe('creditReport — requested/approved/received kept distinct', () => {
  it('reports the three amounts separately', () => {
    const claims = [
      { status: 'approved', requestedAmount: 30, approvedAmount: 20, credits: [credit('A', 8, OCT_5)] },
    ];
    const s = creditSummary(claims, OCT);
    expect(s.requestedOpen).toBe(30);
    expect(s.approvedOpen).toBe(20);
    expect(s.receivedInPeriod).toBe(8);
    expect(s.outstanding).toBe(12); // approved(20) − received(8)
  });

  it('claimTarget prefers approved, then requested, then item sum', () => {
    expect(claimTarget({ approvedAmount: 12, requestedAmount: 20 })).toBe(12);
    expect(claimTarget({ requestedAmount: 20 })).toBe(20);
    expect(claimTarget({ items: [{ amount: 3 }, { amount: 4 }] })).toBe(7);
  });
});

describe('creditReport — corrections & reversals (no double counting)', () => {
  it('re-allocating the same credit note does not double count (credits[] replaces per note)', () => {
    // claimStore.applyCredit replaces the slice for a note; simulate the resulting single entry.
    const claim = { status: 'approved', approvedAmount: 20, credits: [credit('A', 9, OCT_5)] };
    expect(claimReceived(claim)).toBe(9);
    expect(creditReceivedInPeriod([claim], OCT)).toBe(9);
  });

  it('a reversed allocation (removed from credits[]) is no longer counted', () => {
    const before = { status: 'approved', approvedAmount: 20, credits: [credit('A', 9, OCT_5), credit('B', 5, OCT_5)] };
    const after = { ...before, credits: [credit('A', 9, OCT_5)] }; // B voided
    expect(creditReceivedInPeriod([before], OCT)).toBe(14);
    expect(creditReceivedInPeriod([after], OCT)).toBe(9);
    expect(claimOutstanding(after)).toBe(11);
  });
});

describe('creditReport — historical compatibility (legacy receivedAmount, no credits[])', () => {
  it('attributes a legacy received amount to the settled date', () => {
    const legacy = {
      status: 'settled', approvedAmount: 10, receivedAmount: 10,
      history: [{ status: 'settled', at: OCT_5 }],
    };
    expect(claimReceived(legacy)).toBe(10);
    expect(allocationsOf(legacy)[0].legacy).toBe(true);
    expect(creditReceivedInPeriod([legacy], OCT)).toBe(10);
    expect(creditReceivedInPeriod([legacy], SEP_20)).toBe(0);
  });
});

describe('creditReport — decimal-safe', () => {
  it('sums allocations without float drift', () => {
    const claim = { status: 'approved', approvedAmount: 1, credits: [credit('A', 0.1, OCT_5), credit('B', 0.2, OCT_5)] };
    expect(creditReceivedInPeriod([claim], OCT)).toBe(0.3);
    expect(claimReceived(claim)).toBe(0.3);
  });
});

describe('monthlyOutcomes — integrates corrected credit figures', () => {
  it('received this month counts partials on open claims; outstanding nets received', () => {
    const claims = [
      { status: 'approved', approvedAmount: 20, credits: [credit('A', 8, OCT_5)] },      // 8 received, 12 out
      { status: 'settled', approvedAmount: 10, credits: [credit('B', 10, SEP_20)],       // received in Sep
        history: [{ status: 'settled', at: SEP_20 }] },
    ];
    const o = monthlyOutcomes({ claims, now: OCT });
    expect(o.creditReceived).toBe(8);      // only October's allocation
    expect(o.creditOutstanding).toBe(12);  // 20 approved − 8 received
  });
});
