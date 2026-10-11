# 2026-10-11 (part 19) — Audit batch 11: CI workflow + dependency advisories

Back to [[Work-Log]] · [[Home]] · prev [[2026-10-11-Audit-Fixes-Batch10-F2-F4]]

**Domain(s):** CI / release · Dependencies
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Done — the audit's "Dependency and release observations"
- **CI workflow** (`.github/workflows/ci.yml`): the repo had only the scheduled digest workflow, so a green run
  proved nothing about tests/build. New `CI` runs on every push/PR touching `vendora-pos/**`:
  - **frontend** — `npm ci` → `npm run build` → `npm test` (vitest, all 412).
  - **backend** — `npm ci` → app boots → `npm test` (pure + DB-free; provider integration self-skips) → **DB-backed
    `test:pwa-auth` + `test:pwa-sync` against a throwaway `mongo:7` service** (only need a URI + JWT secrets).
  Concurrency-cancel per ref; paths-filtered. Provider suites (Stripe/Insights/docs/images) stay opt-in (need
  secrets) — documented in the workflow header.
- **Dependency advisories (non-breaking, verified):** `npm audit fix` (NO `--force`) on the **frontend** cleared the
  reachable prod advisories **9 → 2** (axios/form-data and friends bumped within semver). The remaining **2 moderate**
  need a **react-router major** — left per the audit ("review major upgrades before applying; don't force"). Restored
  devDeps after the omit-dev prune; **build + 412 tests still green**. **Backend** `npm audit fix` made no change (the
  4 moderate — csv-parse/qs/uuid/node-cron — all need breaking majors, left per the audit); its lockfile churn was
  reverted (no advisory resolved).

## Verification
- Frontend: `npm run build` green + **412/412** after the dependency bump. Backend: app loads; no dep change.
- The CI workflow itself runs on GitHub (can't execute here); it's standard Actions + a mongo service.

## Commit(s)
- `ci: add build/test workflow (+ DB-backed auth/sync); chore(deps): non-breaking frontend audit fix (9→2)`

## Status — audit backlog COMPLETE
All **8 P1s** + all **14 P2s** + the **2 repo test failures** + **CI** + **reachable dependency advisories** are
done. Remaining audit items are the ones it marked as needing owner/infra work or breaking upgrades: the
major-version dep bumps (react-router / csv-parse / qs / uuid / node-cron), and the "staging owner/manager/staff
device matrix + real provider sandbox + restore drill" acceptance steps (owner-run).
