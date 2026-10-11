# 2026-10-11 (part 14) — Audit batch 6: billing same-second ordering (B1)

Back to [[Work-Log]] · [[Home]] · prev [[2026-10-11-Audit-Fixes-Batch5-F1-F3]]

**Domain(s):** Billing / entitlement
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Fixed (P1)
- **B1 — two billing events in the same second could leave the wrong entitlement permanently.** Stripe's event
  `created` is SECOND-resolution, so a renewal and a same-second ending share the same `eventCreatedMs`. The atomic
  ordering guard in `setEntitlementIfNewer` used strict `$lt`, so the second same-second event (the ending) matched
  0 docs and was recorded as "stale/handled" → the entitlement stayed active. Changed the guard to **`$lte`** so
  same-timestamp events still apply (in Stripe's creation/delivery order), matching `decideIngest` (which already
  treats equal as not stale). Genuinely older events (`stored > eventCreatedMs`) are still skipped; duplicate
  deliveries are caught by the separate **eventId idempotency ledger** (`ProcessedBillingEvent`), not this guard.
  (`insightsEntitlementService.setEntitlementIfNewer`.)

## Verification
- `billing.test` +1 (pure: `decideIngest` applies a different same-second event, not stale) → **25/25** + app loads.
- The atomic Mongo `$lte` guard is **DB-gated** (needs `VENDORA_TEST_URI`), so the end-to-end same-second apply is
  verified on a real DB / in CI, not in this sandbox. The change aligns the DB guard with the already-tested pure
  `decideIngest` contract.

## Rollback
- `git revert <sha>` — isolated (one guard operator).

## Commit(s)
- `fix(audit B1): apply same-second billing events ($lte guard) so a same-time ending isn't dropped`

## Remaining audit backlog
- [ ] **B2 (P1)** — concurrent cloud backups can delete both new files; needs an **atomic logical-file version
      pointer** + cleanup that never deletes a competing writer's committed version. **GridFS concurrency — needs
      real-DB race testing**; not safely verifiable in this sandbox, so recommend doing it with the DB integration
      suite rather than rushing it.
- [ ] **P2** D4, D5, F2, F4, F5, F6, B3, B4, B5.
- [ ] CI workflow (build + FE tests + DB-backed PWA integration) + reachable dependency advisories.
