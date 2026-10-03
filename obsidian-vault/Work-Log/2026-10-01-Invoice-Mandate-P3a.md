# 2026-10-01 — Invoice mandate P3a: supplier price history + weekly owner report

Back to [[Work-Log]] · Builds on [[2026-10-01-Invoice-Mandate-P2]]

The two fully-deliverable P3 features (frontend, reuse existing data). Staff access (#5) + notifications
(#6) — the backend/infra-heavy ones — are the remaining P3 work.

## 7 — Supplier price history
- `lib/priceHistory.js` (pure, tested): from **committed invoices only**, normalised to per-single-unit
  cost. `priceSeries` (chronological per product) + `priceHistory` (prev→latest cost, change %, estimated
  gross margin now/prev, **margin-pressure** flag). Sorted margin-pressure first, then biggest cost rise.
- `components/invoices/PriceHistoryView.jsx` (Buy hub "Price history"): prev→current cost + change %, source
  supplier/ref/date, est. gross margin with a margin-pressure chip. Clearly labels **estimated gross margin
  ≠ actual profit**. Never changes retail prices.

## 8 — Weekly owner report
- `lib/report.js` (pure, tested): `weeklyReport({...})` over the last 7 days — named/dated deliveries
  received + stock counts (checking), waste units/£ + items currently past use-by (expiry), open claims +
  **outstanding (pending)** vs **credits received (recovered)** kept strictly separate, and purchase-price
  changes landing this period. States period + generated-at. `reportToText` for download; includes the
  "pending ≠ received" and "not a compliance guarantee" notes.
- `components/report/WeeklyReportView.jsx` (More → Money "Weekly report"): sectioned, readable, with a
  **Download** (.txt). Reuses deliveries/claims/invoices/products/movements/stocktake history.

Names on checking activity populate from actor fields where present; full per-person attribution arrives
with staff access (#5).

## Verification
FE **172/172** (+6: price series/change/margin-pressure/committed-only; report period-filtering, pending-vs-
recovered, waste sum, price-changes). Build clean. Both read-only — no stock/price mutations.

## Commit
`feat(pwa): supplier price history + weekly owner report (P3a)`
