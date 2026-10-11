# 2026-10-11 — External audit round 4: residual recovery edges closed

Back to [[Work-Log]] · [[Home]] · related: [[Conventions]] · [[2026-10-11-Audit-Round3-Recovery-Paths]]

**Domain(s):** waste, invoices/claims, images, billing
**Branch:** `claude/vendora-pos-v3-KPnI0` · base SHA verified: `54663da` (round-3 HEAD)

## Goal
A fourth verification re-checked round 3 at our exact SHA: 9/11 closed, **R8 and R9 only partial**, plus
**two new reproduced edges** — 4 open findings (1 P1, 3 P2). Owner's standing direction was "fix all".
Validated each against the code first (all real), fixed each with a regression that fails on the pre-fix code.

## What changed (one verified, tested commit each)
| ID | Prior | Fix | Commit |
| --- | --- | --- | --- |
| **V1** (P1) | R8 residual | undo recorded the `product:<id>` recovery flag on an unsafe failure but never CHECKED it → a second Undo double-restored (8→10→12). Now blocks the reverse when the flag is set | `76ee3a9` |
| **V2** (P2) | R9 residual | credit-note Delete / Remove / £0 removed the claim credit then wrote the note; a failed note write split the ledgers. Now COMPENSATES (re-applies the claim credit) on a note-write failure; durable `creditnote:<id>` pending-repair + block if compensation also fails | `8904711` |
| **V3** (P2) | new | removeImage/restoreImage went async in R1 but still read/removed with the CURRENT workspace → a shop switch mid-await deleted the NEW shop's same-id image. Pin the ws at entry, pass it to every read/write/remove | `4ea0ae5` |
| **V4** (P2) | new (conditional) | CAS-contention exhaustion recordProcessed'd the unapplied event → a later retry was dropped as duplicate, leaving access active. Now returns `{retryable}` WITHOUT acking; webhook routes 503 so the provider re-delivers | `c32f983` |

## Key patterns (all reinforce the round-3 rule: recovery must survive reload)
- **Record a recovery flag AND check it at the start of the mutating action.** V1 recorded but didn't gate the
  retry — recording without a pre-check still allows the double-apply. Every caller that can set a flag must
  also honour it.
- **Two-write compensation:** when the SECOND write fails after the FIRST committed, actively UNDO the first
  (re-apply the removed claim credit) to return to a consistent state, not just report an error; a durable
  pending-repair flag covers compensation-also-fails. (V2)
- **An operation that became async must re-pin EVERY ambient input** (workspace, session) it reads after an
  await — the switch to async is exactly where a previously-safe sync read turns into a cross-tenant write. (V3)
- **Only acknowledge an idempotency-ledger event that was actually applied or is genuinely stale.** A transient
  "couldn't apply right now" (contention) must stay retryable, never processed. (V4)

## Verification
- **Frontend: 65 files, 449 tests** (446 + 3 new) + production build green.
- **Backend: 209 non-DB tests** + app boots. The V4 reproduction is DB-gated (a re-arming read seam forces
  perpetual CAS contention) — runs against CI Mongo, skipped in the sandbox, alongside the R5 reproduction.

## Follow-ups
- [ ] Owner: redeploy Render + Vercel (no CACHE_VERSION change this round — still v14).
- [ ] Confirm CI green after push (DB-gated V4 + R5 + pwa-auth/sync run there).
- [ ] The notification-worker crash-between-claim-and-send limit remains documented, unchanged (not a regression).
