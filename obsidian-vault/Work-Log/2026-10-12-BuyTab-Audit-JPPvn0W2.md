# 2026-10-12 — Buy-tab audit (bundle JPPvn0W2)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Buying]] · [[Accounting]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Fix the broken/misleading items found in the Buy-tab walkthrough (bundle JPPvn0W2): payments that don't record, a 401 in demo, orders that imply stock changes, missing confirmations/undo, money-sign format, back buttons, plus validation and 44px/aria tap-target gaps.

## Changes
- `src/components/buy/PaymentCalendarView.jsx` — replaced `window.prompt` (silently ignored in installed PWAs) with an inline 44px amount field + Save/Cancel.
- `src/components/insights/NeighbourhoodAreaCard.jsx` — gate the area API on a signed-in session; show a "Sign in to see local figures" note in demo instead of a 401; `ScreenBack`.
- `src/components/orders/OrdersView.jsx` — estimate order value from cost prices ("£X est." / "no cost recorded") instead of £0.00; "Receive one"/"Mark all arrived" now say they don't change stock (book in on Scan); removed misleading "Mark as sent" wording; `ConfirmDialog` + Undo (`restoreOrder`) for cancel/delete; 44px +/- and named aria-labels.
- `src/lib/orderStore.js` — `restoreOrder` (upsert by id) for Undo.
- `src/lib/buyingJourney.js` + `src/components/buy/BuyingJourneyView.jsx` — journeys now seed from committed standalone invoices (`buildFromInvoice`), not just deliveries/open orders; `ScreenBack`.
- `src/components/suppliers/SuppliersView.jsx` — block duplicate supplier names (+toast), phone-pattern validation, Remove → `ConfirmDialog` + Undo (`restoreSupplier`), 44px add form / suggestion chips / Remove, named aria-labels.
- `src/lib/supplierStore.js` — `restoreSupplier` (re-insert preserving id).
- `src/components/invoices/InvoiceCaptureView.jsx` — units-per-case must be ≥1 (blocks commit); negative quantity allowed but flagged as a **credit** line; 44px line inputs / Remove line / + Add line; named aria-labels; `ScreenBack`.
- `src/lib/money.js` + the Buy-tab `money`/`gbp` helpers (PaymentCalendar, SupplierInsights, Claims, CreditNotes, CreditNoteRecovery, PriceHistory, Orders, DeliveryReceiving, WeeklyReport) — negatives now render `-£24.00`, never `£-24.00`.
- `src/components/reorder/ReorderView.jsx` — 44px on Share/WhatsApp/Email, per-supplier Share/Place order, item toggle/±/Remove; named aria-labels (`Increase <name>`, `Mark <name> bought`, …).
- `src/components/requests/RequestsView.jsx` — 44px Add-to-list / Won't-stock / Got-it-in / Delete + inputs; named aria-labels.
- `src/components/delivery/DeliveryReceivingView.jsx` — 44px Supplier/Reference inputs + aria-labels.
- Back-button sweep: inline back → `<ScreenBack>` (82×44, aria-label) across CreditNotes, Requests, PriceAlerts, PriceHistory, Claims, InvoiceCapture, SupplierInsights.
- `public/sw.js` — `CACHE_VERSION` v26 → v27.

## Decisions
- Negative invoice lines are kept (labelled "credit") rather than rejected — real supplier invoices carry credit lines; blocking them would force bad data entry. Only units-per-case <1 hard-blocks, since it makes the per-unit maths meaningless.
- Centralised the money-sign fix in `lib/money.js` and mirrored the one-liner into each view's local formatter (they predate the shared helper); a later cleanup could collapse them onto the shared `money()`.

## Gotchas
- `window.prompt`/`window.confirm` are unreliable in installed PWAs — always use inline fields + `ConfirmDialog`. Promoted to [[Conventions]].

## Verification
- `npx vitest run` → 77 files, 522 tests pass (added a negative-format money test). jsdom canvas getContext warnings are pre-existing noise.
- `npm run build` → green.

## Commit(s)
- `<hash>` — fix(buy): record-payment inline, order value est., confirmations+undo, -£ money sign, 44px/aria, SW v27

## Follow-ups
- [ ] Backend: `/api/pwa-neighbourhood/area` should take postcode in the POST body, not the URL.
- [ ] Manifest screenshots need real device captures.
- [ ] Optional: collapse per-view `money`/`gbp` helpers onto shared `lib/money.js`.
