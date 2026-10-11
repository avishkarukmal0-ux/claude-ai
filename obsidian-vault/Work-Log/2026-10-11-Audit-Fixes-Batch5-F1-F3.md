# 2026-10-11 (part 13) — Audit batch 5: durability + session binding (F3, F1)

Back to [[Work-Log]] · [[Home]] · prev [[2026-10-11-Audit-Fixes-Batch4-D2-D3]]

**Domain(s):** Storage durability · Account/session · Invoice backup
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Fixed (both P1; verified offline with injected failures/switches)
- **F3 — a full localStorage + failed IndexedDB write could destroy the last durable copy while reporting
  success.** The overflow path wrote the value to IndexedDB (async) and **immediately** `removeItem`'d the stale
  localStorage copy — so if the IDB commit later failed, both the previous and the replacement were gone.
  **Commit-before-delete** now: drop the stale localStorage copy ONLY after the IndexedDB write COMMITS; if it
  rejects, the previous value stays as the last-good copy and the failure is surfaced (`STORAGE_ERROR_EVENT`). A
  local-only blob with no durable home + full localStorage now returns `{ok:false}` instead of deleting the only
  copy. (`storage.js write`.)
- **F1 — an invoice upload started in shop A could upload with shop B's token after an account switch.**
  `backupInvoiceFile` now **pins** the workspace + token + shop id at the start: the upload uses the pinned token
  (`authHeader(token)`), all backup state is written to the pinned workspace, and the session is re-validated
  before and after every async step. A mid-upload account switch **cancels cleanly** (`cancelled:true`) instead of
  sending shop A's file under shop B's credentials or writing state into shop B. (`cloudDocs.js`.)

## Verification
- `idb-durability.test`: updated FE3 to the commit-before-delete contract (stale copy kept until `flushDurable`,
  then dropped) + **new** test: a rejected IDB commit keeps the previous localStorage copy. (16 tests.)
- `clouddocs.test`: **new** F1 test — a workspace switch during the upload cancels, performs no upload, and writes
  nothing into the other shop. (6 tests.)
- FE full suite **407/407** + build green. (Logic-only; pending SW v13 still differs from deployed v10.)

## Not changed (noted follow-ups)
- **F2 (P2):** pending photo work can recreate data after a logout purge — same session-pinning pattern, but in
  the image pipeline (`productImages`/`cloudBackup`); separate P2.
- **F4/F5/F6 (P2):** photo trash/restore durability, mounted-form draft reset on workspace change, decode-fallback
  metadata.

## Rollback
- `git revert <sha>` — isolated.

## Commit(s)
- `fix(audit F3/F1): commit-before-delete durability; pin session+workspace across invoice upload`

## Remaining audit backlog
- [ ] **B1/B2 (P1)** same-second billing reconciliation; atomic backup version pointer.
- [ ] **P2** D4, D5, F2, F4, F5, F6, B3, B4, B5.
- [ ] CI workflow + reachable dependency advisories.
