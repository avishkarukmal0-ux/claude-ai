# 2026-10-11 — Dev-tooling dependency advisories (frontend + backend)

Back to [[Work-Log]] · [[Home]] · prior: [[2026-10-11-Deps-React-Router-v7]], [[2026-10-11-Deps-Backend-Majors]]

**Domain(s):** build/test tooling (no app code touched)
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Close the remaining **dev/CI-only** advisories left after the production-dep
sweeps (FE 0 / BE 0 prod were already clear). Owner asked to "go for remaining's
do those very carefully" → "do all if necessary but be so cautious". Staged,
each stage independently built/tested and committed so any stage rolls back
cleanly.

## Changes
- `frontend/package.json` — `postcss ^8.4.32 → ^8.5.29`; new `overrides`
  (`postcss-selector-parser ^7.1.6`, `source-map-js ^1.2.2`); `@vitejs/plugin-react ^4.2.1 → ^5.1.0`; `vite ^5.0.10 → ^7.3.7`; `vitest ^2.1.9 → ^5.0.3`.
- `backend/package.json` — `jest ^29.7.0 → ^30.5.2`.
- Both `package-lock.json` — regenerated (the fixes themselves; not incidental churn).

## Decisions
- **vite 7, NOT vite 8.** vite 8 swaps the production bundler to **Rolldown**,
  which rejected our `manualChunks` object form (`manualChunks is not a function`).
  Swapping the shipped-bundle engine for *dev-only* advisory gains is too much
  risk. vite 7 keeps **Rollup 4** (same engine as vite 5) + **esbuild 0.25**, so
  the bundle is built the same way and chunking is the identical split
  (vendor-react/charts/ui/forms/socket). Cleared tinypool (critical), @vitest/mocker,
  esbuild — all dev/CI-only.
- **tailwindcss 3 → 4: deliberately skipped.** The `braces` advisory it claims
  to fix is `range:*` and `braces@3.0.3` arrives via chokidar either way, so v4
  clears **nothing**, while a CSS-first rewrite risks UI-wide visual regressions
  and raises the browser-support floor (Safari 16.4+ / Chrome 111+) for in-store
  PWA devices. All risk, zero benefit.
- **jest 30** kept as a reviewed modernization even though it clears no advisory
  (regression-free on Node 22). It does NOT drop sprintf-js — jest 30 still pulls
  `babel-plugin-istanbul → @istanbuljs/load-nyc-config@1.1.0` which still pins
  js-yaml@3 → argparse@1 → sprintf-js.
- **No `js-yaml@4` force-override.** It's the only way to drop sprintf-js, but it
  breaks `load-nyc-config`'s `safeLoad` API for a non-exploitable dev DoS
  (coverage nyc-config parsing; we run no `--coverage` and have no nyc yaml). Per
  the audit's no-indiscriminate-force rule, declined.

## Gotchas
- `braces` (high) and `sprintf-js` (moderate) are both **`range:*`** — no patched
  release exists anywhere. npm's `fixAvailable` for them is nonsense (a nodemon
  **downgrade** to 1.14.10, a jest **downgrade** to 25). Both are dev-only,
  trusted-input DoS (glob matching / sprintf precision). Irreducible without
  removing dev tooling. Promoted to [[Conventions]].
- vitest 5 prints a jsdom perf hint ("created 60 times… use pool:'vmThreads' or
  isolate:false"). Left per-file isolation (correctness over speed).
- The jsdom `getContext not implemented` line in the test output is the **F6**
  image-fallback test's expected stderr, not a failure.

## Verification
- **Frontend:** prod advisories **0** (unchanged); full dev audit **18 → 1**
  (only `braces`). Production `npm run build` green with identical chunk split;
  `npm test` **412/412** under vitest 5.
- **Backend:** advisory nodes **37 → 22**; true vulnerable packages = `braces` +
  `sprintf-js` only (both irreducible). App boots; full jest-30 run identical to
  the jest-29 baseline (16 non-DB suites pass; same 5 DB suites fail only on the
  sandbox mongodb-memory-server binary-download block — CI mongo covers them).

## Commit(s)
- `2224cad` — FE non-breaking (postcss / selector-parser / source-map-js), 18→11
- `33bb0bd` — BE non-breaking (browserslist / js-yaml), 37→35
- `da3ea54` — BE jest 29→30 (reviewed major; modernization)
- `2bd46a6` — FE vite 5→7, vitest 2→5, plugin-react 4→5, 18→1

## Addendum — CI made green (the "leftovers")
Inspecting the Actions runs showed **CI had been red on every run since it was
added** — only the backend job, at the `npm test` step. Two root causes:
1. **jest 30 renamed `--testPathPattern` → `--testPathPatterns`** (singular now
   errors). The jest 29→30 bump silently broke `test:unit` / `test:pwa-auth` /
   `test:pwa-sync`. Fixed all three scripts.
2. The **setup.js-based suites** (auth, cashDrawer, lossPrevention, products,
   sales, refundVoid.integration) need a real DB and **don't self-skip** — the
   no-URI `npm test` ran them and they threw on `global.testStore`. Reworked the
   backend job: the no-URI step now `--testPathIgnorePatterns`-excludes those DB
   suites (the URI-gated `pwa*` suites stay and self-skip); a DB-backed step runs
   them `--runInBand` against the mongo:7 service (+ pwa-auth/pwa-sync), giving
   the till/refund API real CI coverage.
- Verified locally: `test:unit` 61/61 under jest 30; the exact no-URI command =
  **16 passed / 9 skipped / 0 failed in ~6s** (no mms timeouts). DB step needs
  the CI service (not runnable in-sandbox) — watched on the run.
- Commit `2217481`.

## Follow-ups
- [x] Confirm CI green on the branch (DB suites run against CI mongo) — fixed in `2217481`, watching the run.
- [ ] Owner: redeploy Render + Vercel to put the full audit backlog live (radius
      deprivation needs centroids re-imported WITH the LSOA column).
- [ ] Accept `braces` + `sprintf-js` as standing dev-only residuals (no upstream
      fix). Re-check at the next `npm audit` whether a patched release has shipped.
