# 2026-10-11 (part 12) — Audit batch 4: inventory atomicity (D2, D3)

Back to [[Work-Log]] · [[Home]] · prev [[2026-10-11-Audit-Fixes-Batch3]]

**Domain(s):** Inventory (delivery / waste / stocktake) · Storage durability
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Fixed (both P1; fully verified offline with injected write failures)
- **D2 — delivery retry could double-count stock.** `applyDelivery` persisted stock, then wrote the goods-received
  movements (which carry the `operationId` idempotency guard) *per line without checking the result*. If that write
  failed after the stock write, stock was incremented but unguarded → a retry (hasOperation=false) applied again.
  Now: persist stock → write ALL movements in ONE atomic `recordMany` (so stock + the durable operation identity
  commit together) → **if the movement write fails, roll the stock back to `prev`**. A retry then finds the original
  stock and no op marker, so it applies exactly once (never double-counts, never loses the delivery). (`inventoryStore.applyDelivery`.)
- **D3 — waste/stocktake could report success despite a failed stock write.** `wasteBatch` and `applyCounts` called
  `persist(next)` and ignored the result, then logged a movement and returned success. Now both check the persist
  result and return `ok:false` (no movement logged, nothing reported) on failure:
  - `wasteBatch` → `{ ok:false, error }` (WasteView already checks `res.ok` → the markdown/bin stays open to retry).
  - `applyCounts` → `{ ok:false, error }`; **`StocktakeView` now checks it** and keeps the count session open with an
    error toast instead of saving the summary / claiming "applied". (`recordWaste` already checked persist — unchanged.)

## Verification
- `delivery.test` +1 (D2: spy `recordMany`→fail → stock rolls back; retry applies once; duplicate still blocked).
- `inventory.test` +2 (D3: spy `writeJSON`→fail → `applyCounts`/`wasteBatch` return ok:false, stock unchanged, no
  phantom movement).
- FE full suite **405/405** + build green. (No SW bump — logic-only; pending v13 already differs from deployed v10.)

## Not changed (deliberately, scope control)
- `addBatch`, `setShelfQty`, `transferStock`, `reverseWaste`, `reverseBatchWaste` also ignore the persist result,
  but they weren't named by the audit and are lower-risk (shelf-split / undo). Noted as a consistency follow-up.

## Rollback
- `git revert <sha>` — isolated.

## Commit(s)
- `fix(audit D2/D3): atomic delivery (stock+op-id, rollback) + propagate waste/count commit failures`

## Remaining audit backlog (in order)
- [ ] **F1/F3 (P1)** async session-generation binding (invoice upload cancels on account switch); commit-before-delete durability.
- [ ] **B1/B2 (P1)** same-second billing reconciliation; atomic backup version pointer.
- [ ] **P2** D4, D5, F2, F4, F5, F6, B3, B4, B5.
- [ ] CI workflow + reachable dependency advisories.
