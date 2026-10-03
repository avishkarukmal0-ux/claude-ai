# 2026-09-29 — 10x pivot: PWA-only, and the shop gets a brain

Back to [[Work-Log]] · Related: [[Implementation-Roadmap]] · [[The-Whole-Story]]

## Goal
Founder call: **forget the till system entirely — the PWA is the product now.** No more
land-and-expand-to-till; pour everything into making the phone app 10x better.
Agreed order for the 10x push: **① Smarter brain → ② New flagship → ③ Real-app feel → ④ PWA superpowers.**
This session = ①, the smarter brain, in full.

## Strategy change (durable)
- **Phase 2 (till + Stripe Connect payment margin) is shelved.** The PWA stands alone as the
  paid product. Anything that only existed to feed the till is deprioritised.
- Consequence: dormant Sale/till Mongoose models are no longer part of the app's roadmap;
  the app's own local stores (inventory, movements, waste, takings) are the whole data model,
  and map onto v3 back-office models (Product, StockMovement) when the backend lands.

## What shipped (all local-first, no backend, verified in headless Chromium @ 390×844)
- **Velocity foundation** — `lib/movementStore.js`: every stock-down is logged as a sale
  (`{ productId, units, at }`, pruned to 180d / 5k records). Helpers: `velocityPerDay`
  (units/day over an effective 7–28d window so short history isn't over-projected),
  `daysOfCover`, `soldInWindow`, `topMovers`, `useMovements()`. `inventoryStore.updateProduct`
  now records the **quantity** sold on each qty decrease (it was thrown away before).
- **Velocity-aware reorder** — `ReorderView`: suggested order qty from a 14-day cover target,
  suggestions sorted **most-urgent first**, subtext "Sells ~X/wk · ~Yd left", a 🔥 **Fast** chip
  for <3-day cover. Falls back to the honest par heuristic when there's no history yet.
- **"Do this today" engine** — `lib/actionEngine.js` + `components/home/TodayActions.jsx`:
  a prioritised action list on Home (critical → warn → info), each with a **£ impact** and a
  one-tap jump to the fixing screen. Covers: hard-stop pulls (illegal to sell), short-dated
  markdowns, fast sellers running out, low stock, dead money, and an after-midday cash-up nudge.
  "All caught up" state when nothing's urgent.
- **Owner insights** — `lib/insights.js` + `OverviewView`: stock value (capital on shelves),
  not-moving £ (cash stuck), **expected sales/wk** (velocity run-rate), value-weighted avg margin,
  and a **best-sellers** mini-chart (28d). Graceful empty hint until sales data exists.

## Verification
- Seeded a convenience shop (expired use-by, short-dated, a fast mover w/ movements, dead stock,
  low line). Action list rendered in correct priority with accurate £ (£6.60 write-off, £15 recoverable,
  £12 tied up); tapping Pull opened Waste. Reorder put Coke top: "Sells ~14/wk · ~1d left · suggest +26" + Fast chip.
- Owner glance: stock £27, not-moving £12, expected £47/wk, margin 55%, best sellers Walkers 50 / Coke 20. No page errors.
- `npm run build` clean both times.

## Commits
- `d5077e3` feat(app): smarter brain — sell-through velocity, urgent reorder & 'Do this today'
- `d0b90ed` feat(app): owner insights — stock value, slow money, weekly projection, best sellers

## Follow-ups
- Next in the 10x order: **② new flagship feature**, then **③ real-app feel** (polish/speed/install), then **④ PWA superpowers** (push/share-target/pocket brief).
- Demand forecasting (M4) is now partly met by the velocity lite-forecast; a fuller forecast still wants longer history.
- When backend lands: sync `movementStore` → `StockMovement`; velocity/insights then span devices.
