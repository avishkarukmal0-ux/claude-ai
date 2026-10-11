# 2026-10-11 — External audit round 2: residuals + regressions closed

Back to [[Work-Log]] · [[Home]] · related: [[Conventions]]

**Domain(s):** billing, backup storage, inventory/delivery, images, insights, SW, notify, reporting
**Branch:** `claude/vendora-pos-v3-KPnI0` · base SHA audited: `2ba4b031`

## Goal
A second external verification (`Vendora-fix-verification.md`) re-checked the first
audit at our exact SHA: 8/22 fully closed, 674 tests green, offline fixed — but 14
had **residual failure/recovery-path gaps**, 3 of them P1, plus a B2 regression
introduced by my own round-1 fix. Owner said "do 1 and 2" (P1s + B2 first, then
the whole backlog, pausing only on genuine product decisions). I validated each
claim against the code before fixing — all were real.

## What changed (one verified, tested commit each)
| ID | Fix | Commit |
| --- | --- | --- |
| **B1** (P1) | a same-second grant can't reactivate a terminal deny (`$lte` opened a reactivation window) — grant only reactivates when STRICTLY newer | `73041e3` |
| **B2** (regr) | greatest-ObjectId selection could keep OLDER cross-process bytes → new `services/backupRev.js`: atomic monotonic `rev` per slot; select highest rev; cleanup drops only lower revs (doc + image services) | `c71a50f` |
| **D2** (P1) | delivery: a FAILED rollback was ignored → double-count retry; now returns `needsRecovery` and the view blocks the naive retry | `24e1ea2` |
| **F3** (P1) | storage overflow commit could delete a NEWER acknowledged value → per-key generation guard | `9c35193` |
| **F2/F4** | image: thumb-only restore keeps its only copy; session guards on backup/fetch async writes | `6d29a2f` |
| **F6** | strip JPEG EXIF/GPS byte-wise when no canvas (phone-photo GPS leak) | `9dff0fd` |
| **F8/F9** | insights: honest "Refreshed" only on fresh data; no stale figures shown for a changed area | `3525f10` |
| **F10** | SW install FAILS if a required entry chunk can't precache (was best-effort → incomplete shell); CACHE_VERSION v13→**v14** | `e228582` |
| **D3** | waste/count: verify the history write (atomic recordMany) + guard undo persistence; roll back / needsRecovery | `478e3c9` |
| **D4** | claims: `persistAll` only commits-then-sets; `removeCredit` reports failure; rollback restores the PRIOR allocation (not £0); remove claim-side first | `4cae4c6` |
| **B4/B5** | digest: release the day-claim on a build/load failure (not just send); `config.notify` (was the dead `config.notifications`) | `f192502` |
| **D6** | weekly report shows the stocktake count from `itemsCounted` (was a `lines` array only) | `01e5a75` |
| **D5** | one order line filled by ALL matching receipts (2+3=5, was 2) | `06f4df6` |
| **D7** | cross-period waste: attribute waste + its reversal to the period each occurred in (immutable past weeks, reversal credited in its week); owner deferred the policy → chose the honest operational one | `f3627dd` |

## Decisions
- **D5 is a bug, not a product decision** (undercount in `receiveAgainst`'s per-line
  loop) → fixed. Only **D7** was a genuine policy choice.
- **D7 policy (owner: "do the best appropriate thing")**: the weekly report is
  generated once per week, so the old global `reversedOriginalIds` exclusion
  silently dropped a reversed waste and OVER-counted across weeks. New: net
  per-period by each entry's own timestamp → past weeks immutable, cross-week
  reversals credited in the week they happen. Same-week waste+undo still nets 0.
- The recurring pattern this round: **check the result of the SECOND write** in any
  two-write operation, roll back on failure, and if the rollback also fails return a
  distinct `needsRecovery`/`unsafe` signal instead of a plain retry. Promoted to
  [[Conventions]].

## Gotchas
- jsdom test state bleed: a deferred fake IndexedDB backend left `initStorage`'s
  own writes as never-resolving promises, failing LATER tests — swap to an
  auto-resolving backend before the reboot step.
- ObjectId ordering within a second across processes is NOT upload order (middle 5
  bytes are per-process random) — never use greatest-`_id` as a version pointer.
- jest 30 uses `--testPathPatterns` (plural).

## Verification
- **Frontend: 61 files, 432 tests** + production build green (vite 7).
- **Backend: 209 non-DB tests** + app boots; the setup.js till/POS suites stay
  excluded (out of scope, PWA-only). Backend DB-level cases (B2 adverse-ObjectId,
  pwa-auth/sync) run against CI mongo, not the sandbox.
- Every fix has a regression test that fails on the pre-fix code.

## Follow-ups
- [ ] Owner: redeploy Render + Vercel to ship round 2 (CACHE_VERSION v14 will
      prompt a one-tap Refresh for existing PWA users).
- [ ] Backend DB-gated proof (B2 cross-process, D2/D3 needsRecovery under real
      Mongo) is CI-only here — confirm the CI check is green after push.
