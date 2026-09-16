# 2026-09-14 — Goods-in scan + live inventory (M1, local-first)

Back to [[Work-Log]] · Related: [[Implementation-Roadmap]] · [[Go-To-Market]] · [[Winning-Strategy]]

## Goal
Founder: "this isn't worth subscribing to yet." Correct — we'd only built the free hook. Build the first **pay-worthy workhorse**: the goods-in scan + a real live inventory, **local-first** so it genuinely works today (backend sync later).

## What changed (files)
- 🆕 `frontend/src/lib/inventoryStore.js` — localStorage-backed store + `useInventory()` hook: add/update/remove, `findByBarcode`, `receiveLines` (known barcode → qty += received & cost update; unknown → create), `margin()`, `isLowStock()`.
- 🆕 `frontend/src/components/scan/BarcodeScanner.jsx` — camera scanner via native `BarcodeDetector` (Chrome/Android), graceful fallback to manual entry (iOS/unsupported).
- 🆕 `frontend/src/components/inventory/InventoryView.jsx` — Stock tab: add/search products, qty steppers, low-stock badges, per-item margin, delete, empty state.
- 🆕 `frontend/src/components/inventory/GoodsInView.jsx` — Scan tab: scan/type barcodes → goods-in lines (prefill from inventory / mark New), edit name/cost/qty → **Receive → updates stock**.
- ✏️ `frontend/src/config/shopTypes.js` — `goods-in` & `inventory` modules now `live:true` with a `tab` target.
- ✏️ `frontend/src/pages/HomePage.jsx` — Scan/Stock tabs render the real views; home module tiles show **Ready** and jump to their tab; removed the ComingSoon placeholder.

## Verification (headless Chromium @ 390×844)
- `npm run build` ✓.
- Booked in 3× Cola + 1× Crisps → **"Receive 4 items"** → session cleared → Stock shows both at qty 3 / 1, both low-stock.
- Re-scanned the Cola barcode → **name prefilled from inventory**; received 1 more → Cola qty **4** (increment by barcode), low-stock flips to In stock.
- **Reloaded → data persisted.** No page errors. Screenshot `inventory.png` in scratchpad.

## Why this matters (strategy)
This is the first feature a shop would actually **pay** for — a daily chore (cash-&-carry book-in) killed, on their real data, offline. It's the daily-open habit the land plan needs. Free tools were the bait; this is the hook.

## Follow-ups
- Backend leg: sync inventory across devices + server `stockMovementService.receive()` (needs DB connected).
- Next value: **waste tracker with £ saved**; reorder suggestions from stock movement; wire `min` per product for smarter low-stock.
- Camera scan works on Chrome/Android; add a note/plan for iOS (BarcodeDetector gap) — manual entry covers it for now.

## Commit
- feat(app): goods-in scan + live inventory (local-first) — M1
