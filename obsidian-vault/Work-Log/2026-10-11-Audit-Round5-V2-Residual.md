# 2026-10-11 — External audit round 5: credit-note compensation residual closed

Back to [[Work-Log]] · [[Home]] · related: [[Conventions]] · [[2026-10-11-Audit-Round4-Residuals]]

**Domain(s):** invoices / credit notes
**Branch:** `claude/vendora-pos-v3-KPnI0` · base SHA verified: `4d95f6b` (round-4 HEAD)

## Goal
A fifth verification re-checked round 4: **V1, V3, V4 closed**; **V2 left one residual P2**. The round-4
credit-note compensation was correct when it SUCCEEDED, but three gaps remained — fixed in one commit.

## What was wrong (all in CreditNotesView.jsx)
1. The **£0** and **Remove** callbacks called the compensating `applyCredit` but IGNORED its result — reporting
   "the claim credit was restored" even when the compensation failed, and recording no flag → a silent split
   (note £10 allocated, claim £0 received).
2. The durable `creditnote:<id>` pending-repair flag was checked ONLY by Delete, so `onApply`/`onUnapply` could
   still mutate a flagged note — the promised block was bypassable through an allocation callback.
3. The early multi-claim Delete rollback (removeCredit-fail branch) ignored its compensation results too.

## Fix (`9b3b3e9`)
- `compensateCredits(cn, allocs)` — re-applies claim credits, CHECKS every `applyCredit` result, and records
  the durable `creditnote:<id>` pending-repair flag if any write fails; returns whether it fully succeeded.
  Used by Delete (both branches), £0 and Remove.
- `noteBlocked(cn)` gate now enforced at the START of Delete, allocate (`>0`), £0, and Remove — a flagged note
  refuses every mutation until the owner reloads and verifies.
- The `>0` allocate path also checks its note-allocation RESTORE write and flags on failure.
- Messages report the ACTUAL state (restored vs. needs-repair), never a restore that didn't happen.

## Verification
- **Frontend: 65 files, 451 tests** (449 + 2 new) + production build green. Frontend-only change; backend
  untouched.
- New regressions: a Delete whose note write AND compensation both fail records the flag; a flagged note
  cannot be mutated through the allocation callbacks.

## Follow-ups
- [ ] Owner: redeploy (no CACHE_VERSION change — still v14).
- [ ] Confirm CI green after push.
- An explicit in-UI "verified, clear" affordance for `creditnote:<id>` (like the delivery/waste banners) could
  be added if credit-note pending-repair proves common; today the flag clears via `recoveryGuard.clear`. The
  notification-worker crash-between-claim-and-send limit remains documented, unchanged.
