# 2026-10-03 — Audit remediation: final data-integrity P2s + accessibility P3

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Accounting]] (claims/credit notes), [[Inventory]] (product merge, backup), [[Frontend]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Finish the remaining audit findings after the P1 + first P2 batches (commits `b8fd3b6`→`abad538`): the trickiest data-integrity items (D3, D5, D6, D7, D10) and the one P3 (FE8). Each fixed with a focused unit test.

## Changes
- `frontend/src/lib/reconcile.js` — **D3**: delivered units are now a shared per-product pool. `dAgg` sums every delivery line for a product (units + units-weighted agreed £/unit) and `consumed` draws each invoice line from the *remaining* supply. Fixes two bugs: two delivery lines (5+5) no longer read as a false shortage against one invoice line of 10; two invoice lines (5+5) against one delivery of 5 now surface the real 5-unit shortage instead of reusing the delivered units twice. Order block + overcharge use the aggregate; leftover supply becomes one `extra_delivered` row per product.
- `frontend/src/components/invoices/CreditNotesView.jsx` — **D5**: `Allocator` now merges already-allocated claims into its rows even when `suggestClaims` drops them (a fully-covered claim has £0 outstanding), so an over-allocation can still be reduced/removed. **D6**: `onApply` with a £0/blank amount now routes through the same both-sides removal as the Remove button (`setAllocation(0)` + `removeCredit`), and a successful allocate rolls the note side back if `applyCredit` fails — the two ledgers can no longer diverge and double-count.
- `frontend/src/lib/productMerge.js` — **D7**: `reassignProductRefs` now also remaps `orders_v1` + `stocktake_history_v1` (nested lines), `markdowns_v1` (top-level), `buylist_v1` (top-level **with dedup-merge** since the buy list keeps one row per product — qty summed, `bought` AND-ed), and the active `stocktake_v1` session (keyed maps `counts`/`expected`/`reasons` have the key renamed and merged). No store is stranded after a product merge.
- `frontend/src/lib/backup.js` — **D10**: `readBackup` now validates per-store *shape* (`STORE_SHAPE`), not just JSON syntax. Every store is a JSON array except `stocktake_v1` (object/null) and `shop_type` (token); a value of the wrong kind is rejected as corrupt (nothing written) instead of crashing the first `.map()`/`.filter()` on load. Unlisted/future stores accept any valid JSON.
- `frontend/src/lib/useDialog.js` *(new)* + `frontend/src/pages/HomePage.jsx` — **FE8**: reusable accessible-dialog hook (Escape-to-close, Tab focus-trap, focus-in on open / restore on close), wired into the HomePage quick-tool overlay.
- `frontend/src/components/worker/WorkerBoard.jsx` — **FE8**: accessible names on the icon-only Send button and per-row flag buttons (`Flag <product> to mark down` / `to restock`); decorative icons `aria-hidden`.
- Tests: `reconcile.test.js` (+3), `creditnotes.test.js` (+1 both-sides invariant), new `productMerge.test.js` (6), `backup.test.js` (+4 shape), new `useDialog.test.jsx` (4).

## Decisions
- D3 fixed by **consuming a shared supply pool** rather than aggregating into one discrepancy per product — keeps the existing per-invoice-line discrepancy shape the UI/claims depend on, so all 1:1 tests pass unchanged.
- D6 "transactional both-sides" guarantee lives in the view (the orchestrator of the two stores) with rollback; `applyCredit`/`removeCredit` were already idempotent and correct.
- D10 defaults unlisted stores to "any valid JSON" so adding a store later can't silently reject a good backup — a conservative choice that still catches the real corruption class.

## Gotchas
- Buy list dedupes by `productId`, so a product merge can collide two rows — must merge, not duplicate, or the store's one-row-per-product invariant breaks.
- `stocktake_v1` is an *object keyed by productId*, not an array of rows — needs key-rename + merge, unlike every other history store.
- `useDialog` keeps `onClose` in a ref so the effect depends only on `active` — otherwise it re-grabs focus on every render.

## Verification
- `npx vitest run` → **371 passed** (55 files). `npm run build` → green.

## Commit(s)
- `fix(data/a11y): audit P2s D3/D5/D6/D7/D10 + P3 FE8` (this entry's commit)

## Follow-ups
- [ ] ⏰ **IMD CSV import still pending** — owner runs `node backend/scripts/import-imd.js <path>`; expect `E01000036: decile 4, rank 10,874 of 33,755, score 25.385`.
- [ ] Owner sets Render neighbourhood env vars (NEIGHBOURHOOD_ENABLED=true + dataset IDs) to switch the feature live.
- [x] All 7 audit P1 + all P2 + the P3 now fixed and tested.
