# 2026-10-14 — UX pass 2 (delivery → claim journey)

Eleven fixes across the receive-a-delivery → supplier-claim → credit flow.

## Model change (threaded through the stores)
A delivery line can now carry **several issues at once** (`line.issues: [{ type, qty }]`) instead of a single
`line.issue`. `deliveryStore.lineIssues(line)` normalises both shapes (non-empty array → use it; else the legacy
`issue`/`issueQty`) and `hasIssue(line, type)` is a convenience. `claimItemsFromDelivery`, `deliveryTotals` and
`buyingJourney.claimableIssues` all iterate `lineIssues`. `blankLine` gains `issues: []` and `priorUnitCost`.

## Items
1. **Receive against an order** (`DeliveryReceivingView.selectOrder`): picking an order now loads its supplier
   and lines, pre-filling **Ordered** from the order and **Delivered = Ordered** so only differences are edited
   (only when the draft has no lines yet, so it never clobbers keyed-in work).
2. **Wrong-price claim** (`claimStore`): default quantity is now **all delivered units** (3 billed wrong → ×3,
   not ×1) and the **agreed £/u defaults to the previous cost** (`priorUnitCost`, captured on the line from the
   product's cost at book-in). `Number(null)` guarded so "unknown prior" stays £0-and-prompt, not "agreed £0".
3. **Share guard** (`ClaimsView`): Share is disabled with an inline hint when the requested total is £0 or a
   wrong-price line has no agreed price.
4. **Cost-up nudge**: a delivery line whose unit cost is above the last cost shows "Cost up X% vs last
   delivery (£a→£b) — wrong price?" with a one-tap that adds the wrong-price issue.
5. **Multiple issues per line**: issue chips toggle independently (Damaged + Wrong price), each with its own
   affected-quantity input; claims build one item per issue. Test added.
6. **Mark settled**: when received ≥ requested a prominent one-tap "Mark settled — £x recovered" appears and
   toasts; settled claims were already excluded from the Weekly report's open count (verified).
7. **Record credit**: approved/settled claims get a "Record credit" button → opens Credit notes with the
   supplier + amount pre-filled; the credit-note Supplier field is now a **picker** of existing suppliers (with
   "Other…" to type a new one). Threaded via `HomePage` `creditPrefill`.
8. **Not worth claiming**: dismiss a delivery-with-issues (kept per-device in localStorage) so it drops out of
   the suggestions; still raisable later.
9. **Buy list**: Stock-row "Order this" now adds a par-based **suggested quantity** (min − current, ≥1), not 1;
   Buy-list header pluralises ("1 unit" / "N units", fixing "1 UNITS").
10. **Weekly report**: pending (unconfirmed) price alerts now listed as **"not confirmed"**, separate from the
    confirmed invoice-based changes (`report.js` `pendingPriceChanges`; UI + text export).
11. **Glossary**: MHRA/FSA/MTD/MUP expanded on the Today card (tool taglines + daily nudges) and Compliance
    radar via the shared `withGlossary` helper (first mention per string). (Began in the v49 pass; extended to
    the Today nudge text here.)

## Files
Stores: `deliveryStore.js`, `claimStore.js`, `buyingJourney.js`, `report.js`, `todaySignals.js` (member nudges
from the earlier pass). Views: `DeliveryReceivingView.jsx`, `ClaimsView.jsx`, `CreditNotesView.jsx`,
`inventory/InventoryView.jsx`, `reorder/ReorderView.jsx`, `report/WeeklyReportView.jsx`, `home/TodayAtShop.jsx`,
`pages/HomePage.jsx`. `public/sw.js` v49→v50.

## Verify
- `npm run build` ✓. Full vitest **547 passed / 80 files** (2 new claim tests: multi-issue + wrong-price defaults).

## Couldn't verify
- No headless device run. The money paths (wrong-price overcharge, multi-issue totals) are covered by unit
  tests; the order-prefill and the credit-note handoff were checked by reading + build, not a live click-through.
- "Order this" uses a simple par heuristic, not the Buy-list's velocity-based `suggestQty` (that needs per-day
  sales velocity not available on the Stock row). The Buy-list suggestions themselves already add their velocity
  figure.

Commit: see git log (branch `claude/vendora-pos-v3-KPnI0`).
