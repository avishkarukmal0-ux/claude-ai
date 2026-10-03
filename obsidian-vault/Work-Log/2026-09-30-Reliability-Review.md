# 2026-09-30 — Reliability & security review; App/Till separation

Back to [[Work-Log]] · Related: [[ADR-002-App-Till-Separation]] · [[Implementation-Roadmap]]

## Goal
Senior review against baseline `ac911a2`: fix verified reliability/security issues, and make the
phone PWA an independent product from the deferred till — without losing data. Delivered in 5
reviewable, individually-verified stages.

## Findings (all confirmed against current code; none already fixed)
Frontend: 2A unscoped/silent-fail storage · 2B waste didn't reduce stock · 2C every decrease
treated as a sale · 2D movement logged via deferred setState (sold delta read as 0) · 2E null
cost → 100% margin · 2F restore left unrelated keys. Backend: 3A storeContext before authenticate
(so `req.store` was never populated → void PIN gate silently dead) · 3B refund not shop-scoped,
no qty/idempotency/discount handling · 3C void PIN skipped when omitted · 3D weak JWT secrets only
warned · 3E loyalty value never deducted from total. Tests: 80 "failures" = **infra** (no mongod
binary, `fastdl.mongodb.org` blocked), not product defects; `validation→422` is intended.

## What shipped
- **Stage 1 (`343d91f`, `774a7fc`)** — `lib/storage.js` workspace scoping + visible save errors +
  non-destructive legacy migration + explicit `copyWorkspace`; typed `movementStore` (sale/waste/
  adjustment/returns/goods-received) with deterministic logging and `velocity()` basis
  (sales/estimated/null); `inventoryStore` rewrite (waste reduces stock w/ undo, sellUnits, honest
  `margin`); versioned `backup` with snapshot + rollback + preview/recovery; all stores scoped.
  **35 Vitest tests.**
- **Stage 2 (`7ebcf77`)** — middleware order authenticate→storeContext; shop-scoped, qty-aware,
  discount-aware, idempotent refunds (`computeRefundLines` extracted + unit-tested); void PIN
  required when policy demands; production fail-fast on weak secrets (`validateSecrets`); loyalty
  deducted from total. **50 backend unit tests**; DB harness bounded (fast skip) + gated
  integration tests for cross-shop refund / duplicate refund / void-without-PIN.
- **Stage 3 (`d7e35ef`)** — PWA/till separation: till pages + providers lazy-loaded and scoped;
  **initial JS 642.82 kB → 151.98 kB** (gzip 139.85 → 39.69); charts vendor off the PWA path.
- **Stage 4 (docs)** — [[ADR-002-App-Till-Separation]]: boundary, data ownership, stable-id
  migration mapping + rollback, and the explicit statement that **multi-device sync is NOT built**.

## Verification (actual results)
- Frontend: `npm test` → **35/35 pass** (waste-once, adjustments-not-sales incl. StrictMode,
  unknown-cost, backup rollback, scoping/migration/no-silent-attach).
- Backend: `npm run test:unit` → **50/50 pass** (refund maths, secret validation, utils). Integration
  suite skips cleanly without a DB; boot verified (dev warns, prod throws on weak secrets, boots on
  strong). App/services import clean.
- E2E (headless Chromium 390×844, prod build): front door → home → stock → **waste reduced stock
  5→4 + waste movement logged** → reorder → **renders offline**. No page errors.

## Data preserved
Nothing dropped/wiped. Legacy `vendora_*` keys retained; scoped copies added once. Till backend
models/data untouched. Backups never delete unrelated (token/account) keys.

## Remaining / blockers
- Integration + full backend suite need a MongoDB (set `VENDORA_TEST_URI`) — can't run in this sandbox.
- Multi-device sync unbuilt (documented). Backend still not connected (needs Atlas URI + host).
- Concurrency: refund double-submit guarded by remaining-qty check; true atomicity needs a txn/lock (noted).

## Pilot readiness
PWA is ready for a **supervised single-shop pilot** (local-first, offline, data-safe). Not for
multi-device / unattended multi-shop until backend sync exists.

## Commits
`343d91f` storage/movements/waste/cost/backup · `774a7fc` frontend tests · `7ebcf77` backend
security · `d7e35ef` app/till separation · (docs this entry).
