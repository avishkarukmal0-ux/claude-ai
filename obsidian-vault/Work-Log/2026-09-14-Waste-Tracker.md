# 2026-09-14 — Waste & savings tracker (£ saved)

Back to [[Work-Log]] · Related: [[2026-09-14-Goods-In-And-Inventory]] · [[Implementation-Roadmap]] · [[Winning-Strategy]]

## Goal
Next pay-worthy layer: make waste **money, visible**. Log what's binned vs what's rescued (marked down in time) → running £ wasted and £ saved this month. Local-first.

## What changed (files)
- 🆕 `frontend/src/lib/wasteStore.js` — localStorage store + `useWaste()`: addEntry({type:'wasted'|'saved', name, value, qty}), removeEntry, plus `monthWasted` / `monthSaved` totals.
- 🆕 `frontend/src/components/waste/WasteView.jsx` — two headline stat cards (Wasted red / Saved green), a "You've rescued £X" banner, quick-add (name + £ + qty → Binned it / Saved it), recent list with +/− amounts.
- ✏️ `frontend/src/config/shopTypes.js` — `expiry` module now `live:true` with `screen:'waste'`.
- ✏️ `frontend/src/pages/HomePage.jsx` — added a full-page `screen` mechanism (module tiles can open a screen, not just a tab); Expiry & waste tile opens Waste; nav tabs clear the screen.

## Verification (headless Chromium @ 390×844, butcher)
- `npm run build` ✓.
- Opened from the Expiry & waste tile → binned £3.50 + saved £6.00 → **Wasted £3.50 / Saved £6.00**, "rescued £6.00" banner shows, recent list correct; **persists across reload**. No page errors. Screenshot `waste.png`.

## Why (strategy)
"Stop paying twice for waste" made real ([[Winning-Strategy]] burden-first). Money-saved is the stickiest feeling in retail — a strong reason to open daily and to pay.

## Backend — honest status
Two workhorses now real but **local-first only** (per device). True depth (sync across devices, real MTD filing, owner numbers from sales) needs the backend connected — which needs the founder's **MongoDB Atlas URI** + a **hosting decision** (always-on). Can't be done from here without those. Frontend is ready to point at the existing backend API once it's live.

## Commit
- feat(app): waste & savings tracker with £ saved (local-first)
