# 2026-10-02 — Review mandate Phase 5: buying decisions + supplier payment calendar

Back to [[Work-Log]] · [[Home]] · follows [[2026-10-02-Review-Phase4-Markdown]]

**Domain(s):** Suppliers, Price history, Invoices (payments), Orders, Claims
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Part A — compare suppliers (buying decisions)
- **`src/lib/supplierInsights.js` (new, pure)** — built on `priceHistory.priceSeries` (already per-single-unit,
  so pack differences line up):
  - `unitCostBySupplier` — latest cost each supplier charged for a product, cheapest first, with **source
    invoice + date**.
  - `compareSuppliersForProduct` — cheapest/dearest + saving; optional **known delivery charge** folded into
    an effective cost (only when provided), else a note that it isn't; explains gaps (no data / single
    supplier) rather than ranking on nothing.
  - `supplierReliability` / `supplierScorecards` — **facts only** (deliveries, shortage rate, claims, settled,
    avg credit turnaround, committed spend) with a `missing[]` list. **No overall score/rank.**
- **`src/components/buy/SupplierInsightsView.jsx` (new)** — "same product, different suppliers" comparison +
  reliability cards; honest empty/limited-data messaging.

## Part B — supplier payment calendar
- **`src/lib/invoiceStore.js`** — invoices gain `dueDate` + `payments[]`; pure helpers `invoicePaid`,
  `invoiceOwed` (null when no total), `invoicePaymentStatus` (paid/partial/unpaid/unknown); mutators
  `setDueDate`, `addPayment` (partial), `removePayment`.
- **`src/lib/paymentCalendar.js` (new, pure)** — aggregates committed-unpaid invoices (soonest due first,
  overdue flagged, partials netted), **total owed** (known totals only), **on-order commitments** (open
  orders), and **expected credits** (outstanding claims) kept **separate** — never netted into what's owed.
  Emits warnings for missing totals / due dates.
- **`src/components/buy/PaymentCalendarView.jsx` (new)** — owe / on-order headline, a separate dashed
  "expected credits (not cash)" card, warnings, the due list with inline due-date + record-payment, and a
  plain "this is a reminder, not your books" disclaimer.
- Wired both into the Buy hub (owner/manager; `MONEY_SCREENS += supplier-insights, payments`).

## How requirements are met
- Equivalent unit costs across suppliers ✓ · source invoice + date ✓ · pack differences ✓ (per-unit) ·
  known delivery charges ✓ (only if recorded, else explained) · recorded shortages + reliability ✓ ·
  claim/credit turnaround ✓ · explain missing data, no unsupported ranking ✓.
- Due dates + payment status + partial payments ✓ · upcoming commitments beside the buy list ✓ ·
  expected credits shown separately from available funds ✓ · incomplete-data warnings ✓ · explicit "not
  accounting / not profit" ✓.

## Verification
- `supplierinsights.test.js` (9) — cross-supplier latest/cheapest, delivery-charge effect, missing-data
  notes, reliability maths, and `paymentCalendar` (overdue, partials, totals, separate credits/commitments).
  Full suite **327/327**; build clean; backend unaffected (new invoice fields are additive + lazy).

## Commit(s)
- (this commit) — feat(pwa): supplier comparison + payment calendar (Phase 5)
