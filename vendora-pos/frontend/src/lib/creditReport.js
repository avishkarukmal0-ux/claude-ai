// Credit accounting — the single, pure source of truth for how supplier-claim money is counted.
// Framework-free and unit-testable. Used by monthly outcomes, the weekly report, notifications and the
// credit-note allocation UI so every surface agrees on the same figures.
//
// THREE AMOUNTS, KEPT DISTINCT (never conflated):
//   requested — what we asked the supplier for.
//   approved  — what the supplier agreed (may be < requested; null until agreed).
//   received  — credit ACTUALLY banked, recorded only as explicit, dated allocations.
//
// RECEIVED is the sum of a claim's `credits[]` — each `{ creditNoteId, amount, at }` is one confirmed
// allocation with its own received date (`at`). Corrections/voids remove the allocation (claimStore
// .removeCredit), so summing `credits[]` is reversal-safe and never double counts. Legacy claims that only
// carry a rolled-up `receivedAmount` (no `credits[]`) are supported: that amount is attributed to the
// claim's settled date (or updatedAt) so historical data still reports in a sensible period.
//
// ROUNDING: all money flows through lib/money (integer pence, half-away-from-zero). See money.ROUNDING.

import { round2, sumMoney, toPence, fromPence } from './money';

// Claim statuses that are still "being chased" — money that is outstanding. Terminal states (settled,
// rejected) and un-submitted drafts are not counted as outstanding.
export const OUTSTANDING_STATUSES = ['submitted', 'acknowledged', 'approved'];

const arr = (v) => (Array.isArray(v) ? v : []);

// Local month comparison (kept here so this module has no dependency on outcomes.js — avoids a cycle).
function sameMonth(ts, now = Date.now()) {
  if (!ts) return false;
  const a = new Date(ts); const b = new Date(now);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Last timestamp a claim reached a given status, from its history (else null). */
function statusAt(claim, status) {
  const h = arr(claim && claim.history).filter((x) => x.status === status);
  return h.length ? h[h.length - 1].at : null;
}

/** The amount being claimed: approved if agreed, else requested, else the sum of item amounts. */
export function claimTarget(claim) {
  if (!claim) return 0;
  if (claim.approvedAmount != null) return round2(claim.approvedAmount);
  if (claim.requestedAmount != null) return round2(claim.requestedAmount);
  return sumMoney(arr(claim.items).map((i) => i.amount));
}

/** Credit actually received on a claim = sum of its dated allocations (or legacy rolled-up receivedAmount). */
export function claimReceived(claim) {
  if (!claim) return 0;
  const credits = arr(claim.credits);
  if (credits.length) return sumMoney(credits.map((c) => c.amount));
  return round2(claim.receivedAmount); // legacy / direct-set; round2(null) → 0
}

/** Outstanding on a claim = target − received, floored at 0 (you can't be owed a negative). */
export function claimOutstanding(claim) {
  return round2(Math.max(0, claimTarget(claim) - claimReceived(claim)));
}

/**
 * The confirmed, dated credit allocations on a claim. Modern claims expose `credits[]`; a legacy claim with
 * only `receivedAmount` yields a single allocation attributed to its settled/updated date so it still lands
 * in a period. Positive amounts only.
 */
export function allocationsOf(claim) {
  if (!claim) return [];
  const credits = arr(claim.credits).filter((c) => (Number(c.amount) || 0) > 0);
  if (credits.length) {
    return credits.map((c) => ({ amount: round2(c.amount), at: c.at || claim.updatedAt || claim.createdAt || null }));
  }
  const received = round2(claim.receivedAmount);
  if (received > 0) {
    return [{ amount: received, at: statusAt(claim, 'settled') || claim.updatedAt || claim.createdAt || null, legacy: true }];
  }
  return [];
}

/**
 * Total credit RECEIVED in the month containing `now` — each allocation counted in the period of its own
 * `at` date, across ALL claims (so partial credits on still-open claims are included, not just settled ones).
 * Decimal-safe: accumulates in integer pence.
 */
export function creditReceivedInPeriod(claims = [], now = Date.now()) {
  let pence = 0;
  for (const c of arr(claims)) {
    for (const a of allocationsOf(c)) {
      if (sameMonth(a.at, now)) pence += toPence(a.amount);
    }
  }
  return fromPence(pence);
}

/** Total credit still outstanding (chasing) across open claims = Σ max(0, target − received). */
export function creditOutstanding(claims = [], statuses = OUTSTANDING_STATUSES) {
  return sumMoney(arr(claims).filter((c) => statuses.includes(c.status)).map(claimOutstanding));
}

/** A distinct-amounts summary for a set of claims (open-claim requested/approved kept separate from received). */
export function creditSummary(claims = [], now = Date.now()) {
  const list = arr(claims);
  const open = list.filter((c) => OUTSTANDING_STATUSES.includes(c.status));
  return {
    receivedInPeriod: creditReceivedInPeriod(list, now),
    receivedTotal: sumMoney(list.map(claimReceived)),
    outstanding: creditOutstanding(list),
    requestedOpen: sumMoney(open.map((c) => (c.requestedAmount != null ? round2(c.requestedAmount) : claimTarget(c)))),
    approvedOpen: sumMoney(open.map((c) => (c.approvedAmount != null ? round2(c.approvedAmount) : 0))),
  };
}
