# 2026-09-30 — Stage 3: Quick counts, locations & shelf refill

Back to [[Work-Log]] · Related: [[2026-09-30-Delivery-Receiving]] · [[ADR-002-App-Till-Separation]]

## Goal
"Know what's on shelves and in storage" — make counts trustworthy and add optional shelf/back
locations with a refill flow. Reuse the existing stocktake; don't duplicate.

## What shipped
- **Snapshot-safe counts** — `inventoryStore.applyCounts()` applies each count's correction
  (`counted − expectedAt`) to CURRENT stock, never a blind overwrite, so a sale/delivery during
  the count is preserved. Marks `countedAt`; logs a `stock_adjustment` (never a sale).
  `stocktakeStore` snapshots the system qty at first count + records an optional per-discrepancy
  reason; `StocktakeView` passes `expectedAt`, shows last-counted, and count-a-shelf-at-a-time copy.
- **Optional locations** — a product's `qty` stays TOTAL; `shelfQty` tracks the shop floor (back
  is derived). `transferStock()` moves units shelf↔back and logs a `transfer` movement; **total
  shop stock never changes** (transfers are ignored by sales/velocity).
- **Refill** — `RefillView` (new "Shelf refill" core module): a "shelf empty · stock out back"
  list with one-tap move-all-to-shelf, a shelf/back adjuster, and opt-in per-product tracking. An
  empty shelf is a refill, **not** an automatic reorder.
- **Honest status** — `stockStatus()` distinguishes `counted` (physically counted) vs `calculated`
  (from movements); sales aren't connected, so that's stated.

## Verification (actual)
- Vitest: 5 new (snapshot-safe count w/ intervening movement; count marks/reason; transfer
  preserves total; shelf clamp; untracked products). Full FE suite **48/48**.
- E2E (headless Chromium 390×844, prod build): 20 out back → Refill → shelf 20 / **total 20** /
  `back→shelf` transfer logged. No page errors. Build clean.

## Data preserved
Additive: new optional product fields `shelfQty`/`countedAt` (default null). No existing records
changed; transfers and counts never alter total stock incorrectly.

## Remaining
Stage 4 batches · Stage 5 order lifecycle + supplier claims + price alerts · Stage 6 staff
tasks/handover · Stage 7 IA cleanup. Heavy infra (auth accounts, IndexedDB, multi-device sync)
still open and documented — not faked.

## Commit
`feat(app): quick counts (snapshot-safe) + shelf/back locations + refill`
