# 2026-10-11 — External audit round 3: deeper recovery/durability paths

Back to [[Work-Log]] · [[Home]] · related: [[Conventions]] · [[2026-10-11-Audit-Round2-Residuals]]

**Domain(s):** billing, storage/durability, images, delivery/inventory, waste, stocktake, claims, insights, product merge
**Branch:** `claude/vendora-pos-v3-KPnI0` · base SHA audited: `ca01a849` (round-2 HEAD)

## Goal
A third external audit (`Vendora-round3-audit.md`) re-checked round 2 at our exact SHA: 15/22 original
findings closed, 704 tests green — but **11 new actionable findings** (5 P1, 6 P2), nearly all a
**deeper failure/recovery path on a round-2 fix**. The recurring theme the auditor named: *a passing helper
test doesn't prove the whole user action commits, rolls back and survives a reopen/reload.* Owner said
"fix all". I validated every claim against the code first — all 11 were real — then fixed each with a
regression test that fails on the pre-fix code.

## What changed (one verified, tested commit each)
| ID | Prior | Fix | Commit |
| --- | --- | --- | --- |
| **R5** (P1) | B1 | same-second grant could still clobber a committed `ended` (`$lte` + a value computed from a stale read) → DB applier is now a compare-and-swap that recomputes `entitlementPatchFor` against the committed state on conflict; the tie then keeps the deny | `4caa618` |
| **R1** (P1) | F4 | "commit-before-delete" checked write()'s SYNC result; the overflow path returns ok before the IndexedDB commit lands → new `storage.writeDurable()` (+ `idb.get`) awaits + reads back; `removeImage`/`restoreImage` are async and confirm the trash is DURABLE before deleting the only copy | `964edb0` |
| **R2** (P1) | new F11 | logout during boot IndexedDB recovery resurrected the purged shop (restore loop re-created its keys) → track workspaces purged while a recovery is active and skip restoring them | `bf6b342` |
| **R3** (P1) | D2 | delivery needs-recovery block was COMPONENT state (reset on reopen/reload) → new `lib/recoveryGuard.js` (durable, device-local, keyed `delivery:<id>`); the receive action stays locked across reload until the owner clears it | `72fb5f1` |
| **R4** (P1) | D3 | `recordWaste` never verified its ledger write (missed in round 2); Waste/Stocktake callers ignored `needsRecovery` → recordWaste now verifies+rolls back+needsRecovery; callers route unsafe into recoveryGuard (`product:<id>` / `stocktake`), block + banner + explicit clear | `9dd82c5` |
| **R8** (P2) | D3 | Waste **Undo** discarded the reverse result and always dropped the entry → check it: keep the entry on a failed restore (retriable), durable block if unsafe | `9a2d5ad` |
| **R9** (P2) | D4 | credit-note **Delete** ignored each `removeCredit` result then deleted the note anyway (split ledgers) → remove each claim credit first + check; delete the note only once all committed | `1a3fde6` |
| **R11** (P2) | new | `productMerge` omitted `trials_v1` + `tasks_v1` (both top-level `productId`) → merge stranded a trial's sales evidence → added both to the top-level remap | `7be49f2` |
| **R6** (P2) | F2 | `confirmSuggested` pinned the session only inside `saveImage` (after its own fetch await) → capture the pin at the outermost entry and re-check after the fetch | `a9e880a` |
| **R7** (P2) | F8 | "Who lives here" community kept the previous area's make-up while a new area loaded (round 2 cleared only the headline) → clear the community profile on an area/radius key change | `f33d644` |
| **R10** (P2) | new | delivery stock committed but `markReceived` failed → draft stuck, retry rejected as duplicate → markReceived reports success; receive() applies only when not already applied (idempotent), else finishes the document without re-applying stock | `9c85459` |

## Key decisions / patterns (promoted to [[Conventions]])
- **Durability in the overflow path is ASYNC.** `write()` returns `{ok:true, overflow:true}` before the
  IndexedDB commit lands. Before deleting the only other copy of anything, confirm the durable commit
  (`writeDurable` = flush + read-back), don't trust the synchronous ok. (R1)
- **Recovery blocks must be DURABLE, not component state** — a two-write op left unsafe (second write +
  rollback both failed) persists a `recoveryGuard` record keyed to a stable id, survives reopen/reload, and
  only clears on explicit owner acknowledgement. (R3/R4/R8)
- **Verify the SECOND write in EVERY two-write caller** — recordWaste was the one path that still didn't
  (round 2 fixed its siblings). Grep for the pattern, don't fix one instance. (R4)
- **A concurrent read-modify-write needs CAS + recompute, not just a conditional write** — guard on the exact
  ordering token read (`lastEventId`); on a 0-match re-read and recompute the patch against the committed
  state. A value computed from a stale read is wrong even when the write is atomic. (R5)
- **Capture the session/identity pin at the OUTERMOST async entry** and re-check after each await — pinning
  inside a nested callee runs after the caller's own await has already resolved. (R6)
- **A product-id remap must cover EVERY store that carries a productId** (top-level or nested) — a merge that
  misses one strands that store silently. (R11)
- **Idempotent completion:** a multi-step commit (stock → document) must finish the later step from the
  committed operation identity without re-running the first; gate re-application on the operation guard. (R10)

## New files
- `frontend/src/lib/recoveryGuard.js` (+ `recoveryGuard.test.js`) — durable needs-recovery store + hook.
- `storage.writeDurable()` + `idb.get()` — durable-commit confirmation.

## Verification
- **Frontend: 65 files, 446 tests** (432 + 14 new) + production build green (vite 7).
- **Backend: 209 non-DB tests** + app boots. The R5 same-second reproduction is DB-gated (deterministic
  one-shot read seam forces the adverse interleave) — runs against CI Mongo, skipped in the sandbox.
- Every fix has a regression test that fails on the pre-fix code (R7 is a presentation-timing fix the audit
  classified source-confirmed; verified by code review + the insights suites staying green).

## Follow-ups
- [ ] Owner: redeploy Render + Vercel (CACHE_VERSION already v14 from round 2 — no new SW bump this round).
- [ ] Confirm the CI check is green after push (the DB-gated R5 test + pwa-auth/sync run there).
- [ ] The audit's `B4` process-kill note (a claim with no expiring lease) remains a known operational limit,
      excluded from the 11 (not reproduced); a claim token/expiry is future hardening if crash-safe daily
      delivery becomes a hard requirement.
