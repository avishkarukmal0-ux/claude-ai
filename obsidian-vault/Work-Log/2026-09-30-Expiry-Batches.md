# 2026-09-30 — Stage 4: Expiry & waste with batches

Back to [[Work-Log]] · Related: [[2026-09-30-Counts-Locations-Refill]] · [[ADR-002-App-Till-Separation]]

## Goal
Replace the single-expiry-per-product assumption with optional dated batches, and make waste bin
the correct batch with honest money labels. Reuse the existing waste/expiry screen.

## What shipped
- **Batch model** (`inventoryStore`): optional `batches:[{id,qty,expiry,dateType}]`; `qty` stays
  TOTAL and date-coding (`addBatch`) allocates from the UNDATED remainder — describes stock you
  already have, never changes the total. Helpers `batchesOf/datedQty/undatedQty/batchExpiryInfo`
  and `fefo()` (near/expired batches + unbatched fallback, earliest-first).
- **Correct-batch waste**: `wasteBatch()` reduces the chosen batch AND the product total exactly
  once, logs a WASTE movement with `productBatchId` + valuation (never a sale); `reverseBatchWaste()`
  restores the total and tops up / recreates the batch and drops the movement. Both guarded.
- **WasteView (batch-aware)**: "Sell first" is now per batch, soonest first. Hard-stop dates
  (use-by/medicine past) → "Do not sell — pull now" with a Pull action and **no markdown/sell**;
  soft dates → a "mark down to sell in time" hint (guidance, not saved money). "Date-code stock"
  section adds a batch from undated stock. Header shows retail "at risk (est.)" — an estimate,
  kept separate from money actually saved.

## Verification (actual)
- Vitest: 5 new (allocate-from-undated + total unchanged; cap; FEFO order + hard-stop flag; bin
  correct batch once + undo; over-bin guard). Full FE suite **53/53**.
- E2E (headless Chromium 390×844, prod build): expired use-by batch → "Do not sell" → Pull →
  total 5→4, batch 3→2, waste logged against the batch (`productBatchId`, delta −1). No errors.
- Build clean.

## Data preserved
Additive: optional `batches` on products (absent = unchanged behaviour). No records altered;
totals never change on date-coding; batch waste is reversible.

## Remaining
Stage 5 order lifecycle + supplier claims + price alerts · Stage 6 staff tasks/handover ·
Stage 7 IA cleanup. Heavy infra (auth accounts, IndexedDB, multi-device sync) still open —
documented in [[ADR-002-App-Till-Separation]], not faked.

## Commit
`feat(app): expiry & waste with batches (FEFO, correct-batch waste, honest £)`
