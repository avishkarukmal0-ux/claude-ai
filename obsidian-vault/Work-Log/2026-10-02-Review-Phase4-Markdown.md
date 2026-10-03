# 2026-10-02 — Review mandate Phase 4: batch-linked markdown workflow

Back to [[Work-Log]] · [[Home]] · follows [[2026-10-02-Review-Phase3-Doc-Backup]]

**Domain(s):** Expiry / Waste / Markdown
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Finding
The FEFO "Sell first" list showed a "Mark down to sell in time" badge but there was **no markdown action** —
no way to set a reduced price, print a label, or track the outcome. Batch/expiry/hard-stop infra already
existed (`fefo`, `worstExpiry`, `mustPull`, `batchesOf`).

## Changes (extends expiry/waste — no parallel screen)
- **`src/lib/markdownStore.js` (new, synced `markdowns_v1`)** — a markdown is a PRICE action + a label, not a
  stock movement and not a sale:
  - `createMarkdown` never changes stock; **refuses hard-stop (mustPull) stock** ("pull, don't sell").
  - `validateMarkdown` — qty > 0, reduced price > 0 and below the current price.
  - `recordOutcome(soldReported, binned)` — manually reported; `soldReported` is **estimated recovery**,
    never a confirmed sale.
  - Pure helpers: `estimatedRecovery` (reduced × reported sold), `markdownLabelText`, `markdownTotals`
    (estimated-only). Decimal-safe via `lib/money`.
- **`src/components/waste/WasteView.jsx`** — "Mark down" on each sellable FEFO row → qty + reduced-price form
  → create → **print** (opens a printable label) / **share** (navigator.share/clipboard). An "On markdown"
  section lists active markdowns with Print/Share and **Record outcome** (sold reported + bin the leftover).
  Binning the leftover goes through the EXISTING waste flow (real stock movement); "sold" is reported-only.
- **`markdowns_v1`** added to client `STORE_NAMES` and backend sync `ALLOWED` (not FINANCIAL → staff may use
  it, like waste).

## How requirements are met
- Select batch, qty, reduced price → the row carries its batchId; form captures qty + reduced price.
- Printable/shareable label → `printLabel` (print window) + `shareLabel`.
- Track action + outcome → store status active→closed with reported sold/binned.
- Confirmed sales only via explicit records/imports → markdown "sold" is reported/estimated, never a sale,
  never changes stock.
- Estimated recovery separate from confirmed receipts → `estimatedRecovery`/`markdownTotals` are labelled
  estimates; the UI says confirmed sales come only from till imports.
- Don't reduce stock on markdown creation → `createMarkdown` touches no stock.
- Prevent double counting (sales/waste/corrections) → sold = reported-only (no stock, no sales ledger);
  binned = the existing waste movement; the two are disjoint.
- Never recommend selling past a hard stop → `mustPull` rows have no "Mark down" button and the store refuses.
- No till/payments introduced.

## Verification
- `markdown.test.js` (7): validation incl. hard-stop refusal, create-doesn't-change-stock, reported outcome +
  estimated recovery, label/totals. Full suite **318/318**; build clean; backend app loads (ALLOWED += one).

## Commit(s)
- (this commit) — feat(pwa): batch-linked markdown workflow with printable labels (Phase 4)
