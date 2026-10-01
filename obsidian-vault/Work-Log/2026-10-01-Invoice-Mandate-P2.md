# 2026-10-01 — Invoice mandate P2: credit-note matching + claim reminders

Back to [[Work-Log]] · Builds on [[2026-10-01-Invoice-Mandate-P1.2-Reconcile]]

Completes the money side of the journey: confirm the supplier credit against the claim, and chase overdue
claims. Reuses the existing requested/approved/**received** fields.

## 3 — Credit-note matching
- `lib/creditNoteStore.js` (new, synced `credit_notes_v1`): a credit note `{ supplier, reference, date,
  amount, allocations[] }`. `suggestClaims(cn, claims)` ranks open claims with an outstanding balance
  (same supplier, reference overlap, amount closeness, recency; different-supplier skipped).
  `claimOutstanding` = approved(or requested) − received. `setAllocation` guards against over-allocating a
  note across claims. `allocatedTotal`/`remainingToAllocate`.
- `claimStore.applyCredit(claimId, { creditNoteId, creditNoteRef, amount })`: money received is the sum of
  an **auditable `credits[]` list**, **idempotent per credit note** (re-applying a note replaces its slice,
  never double-counts), supports **partial** credits and **one note across multiple claims** and **multiple
  notes on one claim**. `removeCredit` recomputes received (correction). Both append a `history` event. This
  is the ONLY way money is recorded received — a status change never implies payment (Phase 0).
- `components/invoices/CreditNotesView.jsx`: add a credit note → "Match to claims" shows suggestions →
  allocate an amount per claim with **explicit Allocate/Update** (the required confirmation) → applied to
  the claim's received; remove to correct. In the Buy hub ("Credit notes"). Reuses `useClaims` +
  `useSuppliers`.

## 4 — Claim reminders (extend existing follow-up dates + attention queue)
- `actionEngine.buildActions` now takes `claims` and surfaces **overdue claims** (open status + follow-up
  date in the past) as a Home attention row with outstanding £ and a "next action" (open claims).
  `TodayActions` passes `claims`.
- `ClaimsView`: a **Snooze 1wk** button beside the follow-up date (moves the date; the reminder returns
  when due). No supplier communication is ever sent automatically — sharing a claim stays a deliberate tap.

## Verification
FE **166/166** (+5 credit allocation: outstanding/suggest/idempotent apply/remove-correction/over-allocate
guard). Build clean; backend boots (new store added to sync allowlist). No double-apply: credit notes only
adjust claim `received` via the audited credits list; stock/invoice untouched.

## Commit
`feat(pwa): credit-note matching + claim reminders (P2)`
