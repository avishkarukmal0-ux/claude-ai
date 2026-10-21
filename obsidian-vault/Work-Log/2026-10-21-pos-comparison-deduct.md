# 2026-10-21 — POS slice 3: Comparison Mode + opt-in stock deduction

Back to [[Work-Log]] · [[Home]] · builds on [[2026-10-21-pos-connect-till-ui]]

**Domain(s):** [[Frontend-Overview]] · [[Integrations/Sales-Ingestion-Design]] · [[Domains/Inventory]]
**Branch:** `claude/vendora-pos-v3-KPnI0`
**Commit:** `c9b3a4a`

## Goal
The first POS slice that can touch stock. Give owners a safe on-ramp from "imports record sales evidence"
(slices 1–2) to "imports actually reduce stock" — behind an explicit, per-shop, owner-only opt-in with an
opening baseline, so historical sales already in the manual counts are never deducted twice.

## The model (why it's safe)
`inventory_v1.product.qty` is the stored source of truth; on multi-device merge it's reconstructed as
`opening + ledgerSum(movements)` where `opening = winnerQty − ledgerSum(winnerMovements)`. So a `SALE`
movement is exactly what carries a deduction across devices, and pairing a local `qty` decrement **with** that
movement is consistent under merge (they cancel on the winning side, apply only where the movement is absent).
That's the deduction primitive — same shape as the existing `sellUnits`.

## What changed
**Core (framework-free, unit-tested)**
- `lib/salesImportStore.js`:
  - `compareImport(analysis, { products, openingStockAt })` — **pure, writes nothing.** Per-product imported
    units vs current qty vs implied-remaining (clamped ≥0); splits deductible (dated ≥ baseline) vs historical;
    flags `totalsOnly` (a totals/summary report with no item rows → can never deduct).
  - `applyImport(analysis, meta, { deduct, cutoff })` — new 3rd arg. **Velocity (default):** unchanged, writes
    `SALE` movements, no qty change. **Deduct (opt-in):** filters lines to day ≥ cutoff, refuses totals-only /
    missing-baseline, calls `deductImportedSales`, tags the history entry `deducted:true, openingStockAt`.
  - `undoImport` restores stock for a deducted import (not just removes movements).
- `lib/inventoryStore.js`:
  - `deductImportedSales(lines, { operationId, batchId, reason })` — idempotent (`hasOperation`), caps each at
    `min(units, qty)` so stock never goes negative and the ledger matches the qty change exactly.
    **Movements-first** ordering so a partial-write retry can't double-deduct (the operationId guard is armed
    before the qty write). Unknown products skipped (never invents stock). Sales-only (returns rejected upstream).
  - `restoreImportedSales(batchId)` — undo: adds back the recorded per-product amounts, then removes the batch's
    movements (re-importable). Added missing `removeByBatch` import.
- `lib/posSettingsStore.js` (NEW) — per-shop `{ deductEnabled:false, openingStockAt, enabledBy, enabledAt }`.
  Defaults OFF. `enableDeductions` records baseline = now; `canManageDeductions(role)` gates to owner/manager
  (staff can't). Hook `usePosSettings`.

**UI**
- `components/salesimport/SalesImportView.jsx`: owner-only `DeductionPanel` (off by default, two-step confirm,
  explains the opening baseline); a `ComparisonTable` (Sold / In stock / After) shown before deducting; two
  separated actions — primary **"Record … as evidence"** (always safe) and the amber **"Deduct … from stock"**
  (only when enabled, never for totals-only, with a historical-units note). Staff never see the toggle.
- SW `CACHE_VERSION` v67 → **v68**.

## Decisions
- **Three distinct actions**, each consuming the same `operationId`, so a file used one way can't be re-used the
  other: Compare (pure) → Record evidence (velocity) → Deduct (opt-in). No double-count possible.
- **Never negative, never phantom:** deduct caps at stock-on-hand; a behind count under-deducts (safe
  direction) and Comparison Mode surfaces the gap first.
- **Returns ≠ restock:** the CSV path is sales-only (qty ≤ 0 rows already rejected as invalid upstream); a
  refund never silently restocks. Provider-level returns remain a slice-4 concern.

## Gotchas
- `movementStore` prunes rows older than **180 days relative to the real `Date.now()`** — tests must anchor
  timestamps to `Date.now()`, not a hard-coded epoch, or the ledger reads empty. Noted in [[Conventions]].

## Verify
- `npm run build` ✓ · full vitest **600 passed (84 files)** ✓ · new suite `salesImportDeduct.test.js` **14** ✓
  (compareImport, deduct cap/idempotency/restore, posSettings role-gate + baseline, applyImport deduct
  cutoff/tagging/undo).

## Follow-ups
- [ ] Slice 4: backend cloud scaffolding (OAuth/webhook-verify stubs, durable queue) — disabled until approvals.
- [ ] Slice 5: status/recovery screens, pilot feedback, sandbox tests.
- [ ] Multi-device check once the EU move lands: confirm deducted imports reconcile as expected across two
  devices (the merge arithmetic is reasoned above + unit-covered, but worth a live two-device pass).
