# 2026-09-16 — Reorder suggestions / Buy list

Back to [[Work-Log]] · Related: [[2026-09-14-Goods-In-And-Inventory]] · [[Implementation-Roadmap]] · [[Features-To-Build]]

## Goal
Turn the inventory into action: low stock → a tickable **cash-&-carry buy list**. The jump from record-keeping to "the app tells me what to buy." Local-first (backend deferred by decision).

## What changed (files)
- 🆕 `frontend/src/lib/buyListStore.js` — localStorage `useBuyList()`: add (dedupes by product, bumps qty), setQty, toggleBought, removeItem, clearBought, hasProduct.
- 🆕 `frontend/src/components/reorder/ReorderView.jsx` — "Running low — suggested" (low-stock products not already listed, with a suggested restock qty) + the tickable buy list (qty steppers, mark bought, clear bought). Honest heuristic for suggested qty (par = min×2 or 6; real sales-velocity forecasting comes later with the backend). Closes the loop: prompt to book bought stock in on the Scan tab.
- ✏️ `frontend/src/config/shopTypes.js` — new core module `reorder` (Buy list, `live`, `screen:'reorder'`); added to `CORE_MODULE_IDS`.
- ✏️ `frontend/src/pages/HomePage.jsx` — render `ReorderView` for `screen==='reorder'`.

## Verification (headless Chromium @ 390×844)
- `npm run build` ✓.
- Seeded Cola qty 1 (low) + Bread qty 20 → **only Cola suggested** (Bread correctly excluded) → Add → on list → tick bought (strike-through + "Clear 1 bought") → **persists across reload**. No page errors. Screenshot `reorder.png`.

## Why (strategy)
"The app tells me what to buy" = saves thinking, not just records — a pay-worthy step. Feeds the goods-in loop (buy → book in → stock updates). This is a lite, local version of Features-To-Build §A "sales-velocity suggested reordering"; the true forecast needs sales data (Phase-2/backend).

## Commit
- feat(app): reorder suggestions + cash-&-carry buy list (local-first)
