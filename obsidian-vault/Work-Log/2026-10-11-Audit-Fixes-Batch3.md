# 2026-10-11 (part 11) — Audit batch 3: claim/report correctness (D1, D6, D7)

Back to [[Work-Log]] · [[Home]] · prev [[2026-10-11-Audit-Fixes-Batch2-F10]]

**Domain(s):** Accounting/claims · Reports
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Fixed (pure logic, fully verified offline)
- **D1 (P2) — wrong-price claim total stuck at £0.** `updateClaimItem` guarded `requestedAmount` on
  `c.status === 'requested'` — a status that doesn't exist (lifecycle is draft → submitted → …). A new wrong-price
  claim is `draft`, so its edited line amount never reached the requested/approved total. Changed the guard to
  `!c.status || c.status === 'draft'`: the draft tracks its items; once submitted/agreed the figure is left
  authoritative. (`claimStore.js`.)
- **D6 (P2) — weekly report omitted completed stocktakes.** `tsOf` read `at/date/receivedAt/committedAt/createdAt`
  but stocktake history stores **`finishedAt`** (and `startedAt`), so counts timestamped only with `finishedAt`
  fell out of the period and were never counted. Added `finishedAt` + `startedAt` to `tsOf`. (`report.js`.)
- **D7 (P2) — weekly report counted fully-reversed waste.** The waste total summed every WASTE movement, including
  ones later undone. Now it drops the compensating reversal entries (they carry `reversalOf`) AND the originals
  they reverse, so a fully-undone waste contributes 0 units / £0. (`report.js`.)

## Verification
- `report.test` +2 (D6 finishedAt, D7 reversed-waste nets to 0); `claims.test` wrong-price test extended to assert
  the draft's `requestedAmount` tracks the edit (D1).
- FE full suite **402/402** + build green. (No SW bump — logic-only; the pending v13 already differs from the
  deployed v10, so installed PWAs still get the Refresh prompt on deploy.)

## Rollback
- `git revert <sha>` — isolated.

## Commit(s)
- `fix(audit): D1 wrong-price claim total, D6 report finishedAt, D7 report nets reversed waste`

## Remaining audit backlog (in order)
- [ ] **D2 (P1)** delivery retry double-count — persist stock + durable op identity together (idempotent).
- [ ] **D3 (P1)** waste/stocktake report success despite failed inventory write — propagate commit failure, retain session.
- [ ] **F1/F3 (P1)** async session-generation binding; commit-before-delete durability.
- [ ] **B1/B2 (P1)** same-second billing reconciliation; atomic backup version pointer.
- [ ] **P2** D4, D5, F2, F4, F5, F6, B3, B4, B5.
- [ ] CI workflow + reachable dependency advisories.
